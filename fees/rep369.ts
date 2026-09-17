import { FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const REP369 = "0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369".toLowerCase();
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27".toLowerCase();
const MAIN_PAIR = "0x240e7A47fE5F91806c6D6056Fe4f62622303E1A5".toLowerCase();

const ZERO = 0n;
const BPS = 10_000n;

const ABIS = {
  swap:
    "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
  transfer:
    "event Transfer(address indexed from,address indexed to,uint256 value)",
  token0: "address:token0",
  token1: "address:token1",
  liquidityFees: "uint16:liquidityFees",
  rewardsFees: "uint16:rewardsFees",
  autoBurnFees: "uint16:autoBurnFees",
  liquidityUpdated:
    "event LiquidityFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
  rewardsUpdated:
    "event RewardsFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
  burnUpdated:
    "event AutoBurnFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
};

type FeeState = {
  total: [bigint, bigint];
  liquidity: [bigint, bigint];
  rewards: [bigint, bigint];
  burn: [bigint, bigint];
};

const asBigInt = (value: any): bigint => BigInt(value ?? 0);
const argsOf = (log: any) => log?.args ?? log;
const txHashOf = (log: any) =>
  String(log?.transactionHash ?? log?.txHash ?? "").toLowerCase();
const blockOf = (log: any) => Number(log?.blockNumber ?? 0);
const txIndexOf = (log: any) => Number(log?.transactionIndex ?? 0);
const logIndexOf = (log: any) => Number(log?.logIndex ?? 0);

const compareLogs = (a: any, b: any) =>
  blockOf(a) - blockOf(b) ||
  txIndexOf(a) - txIndexOf(b) ||
  logIndexOf(a) - logIndexOf(b);

const recalcTotal = (state: FeeState) => {
  state.total[0] =
    state.liquidity[0] + state.rewards[0] + state.burn[0];
  state.total[1] =
    state.liquidity[1] + state.rewards[1] + state.burn[1];
};

const applyFeeUpdate = (
  state: FeeState,
  log: any,
  kind: "burn" | "liquidity" | "rewards"
) => {
  const args = argsOf(log);
  const target =
    kind === "burn"
      ? state.burn
      : kind === "liquidity"
        ? state.liquidity
        : state.rewards;

  target[0] = asBigInt(args.buyFee);
  target[1] = asBigInt(args.sellFee);
  recalcTotal(state);
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  if (options.chain !== CHAIN.PULSECHAIN) {
    throw new Error("REP369 adapter only supports PulseChain");
  }

  const [token0Result, token1Result, startLiquidity, startRewards, startBurn] =
    await Promise.all([
      options.api.call({ target: MAIN_PAIR, abi: ABIS.token0 }),
      options.api.call({ target: MAIN_PAIR, abi: ABIS.token1 }),
      Promise.all([
        options.fromApi.call({
          target: REP369,
          abi: ABIS.liquidityFees,
          params: [0],
        }),
        options.fromApi.call({
          target: REP369,
          abi: ABIS.liquidityFees,
          params: [1],
        }),
      ]),
      Promise.all([
        options.fromApi.call({
          target: REP369,
          abi: ABIS.rewardsFees,
          params: [0],
        }),
        options.fromApi.call({
          target: REP369,
          abi: ABIS.rewardsFees,
          params: [1],
        }),
      ]),
      Promise.all([
        options.fromApi.call({
          target: REP369,
          abi: ABIS.autoBurnFees,
          params: [0],
        }),
        options.fromApi.call({
          target: REP369,
          abi: ABIS.autoBurnFees,
          params: [1],
        }),
      ]),
    ]);

  const token0 = String(token0Result).toLowerCase();
  const token1 = String(token1Result).toLowerCase();

  if (
    ![token0, token1].includes(REP369) ||
    ![token0, token1].includes(WPLS)
  ) {
    throw new Error("REP369 main pair is not REP369/WPLS");
  }

  const repIs0 = token0 === REP369;
  const quoteToken = repIs0 ? token1 : token0;

  const state: FeeState = {
    total: [ZERO, ZERO],
    liquidity: [asBigInt(startLiquidity[0]), asBigInt(startLiquidity[1])],
    rewards: [asBigInt(startRewards[0]), asBigInt(startRewards[1])],
    burn: [asBigInt(startBurn[0]), asBigInt(startBurn[1])],
  };
  recalcTotal(state);

  const [swapLogs, transferLogs, burnUpdates, liquidityUpdates, rewardUpdates] =
    await Promise.all([
      options.getLogs({
        target: MAIN_PAIR,
        eventAbi: ABIS.swap,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        target: REP369,
        eventAbi: ABIS.transfer,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        target: REP369,
        eventAbi: ABIS.burnUpdated,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        target: REP369,
        eventAbi: ABIS.liquidityUpdated,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        target: REP369,
        eventAbi: ABIS.rewardsUpdated,
        entireLog: true,
        parseLog: true,
      }),
    ]);

  const updates = [
    ...(burnUpdates || []).map((log: any) => ({
      ...log,
      _kind: "burn" as const,
    })),
    ...(liquidityUpdates || []).map((log: any) => ({
      ...log,
      _kind: "liquidity" as const,
    })),
    ...(rewardUpdates || []).map((log: any) => ({
      ...log,
      _kind: "rewards" as const,
    })),
  ].sort(compareLogs);

  // The token contract collects trading tax by transferring REP369 to itself
  // during the same transaction as the corresponding user-facing swap.
  // Use those exact on-chain tax transfers rather than reconstructing the tax
  // from pair amounts, which avoids fee-on-transfer rounding problems.
  const taxByTx = new Map<string, bigint>();

  for (const log of transferLogs || []) {
    const args = argsOf(log);
    const from = String(args.from ?? "").toLowerCase();
    const to = String(args.to ?? "").toLowerCase();
    const tx = txHashOf(log);

    if (!tx || to !== REP369 || from === REP369) continue;

    const value = asBigInt(args.value);
    if (value > ZERO) {
      taxByTx.set(tx, (taxByTx.get(tx) || ZERO) + value);
    }
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let updateIndex = 0;

  for (const swap of [...(swapLogs || [])].sort(compareLogs)) {
    while (
      updateIndex < updates.length &&
      compareLogs(updates[updateIndex], swap) <= 0
    ) {
      applyFeeUpdate(
        state,
        updates[updateIndex],
        updates[updateIndex]._kind
      );
      updateIndex++;
    }

    const args = argsOf(swap);
    const repIn = asBigInt(repIs0 ? args.amount0In : args.amount1In);
    const repOut = asBigInt(repIs0 ? args.amount0Out : args.amount1Out);
    const quoteIn = asBigInt(repIs0 ? args.amount1In : args.amount0In);
    const quoteOut = asBigInt(repIs0 ? args.amount1Out : args.amount0Out);

    // Count quote-side value exactly once per swap.
    const quoteVolume = quoteIn > ZERO ? quoteIn : quoteOut;
    if (quoteVolume > ZERO) {
      dailyVolume.add(
        quoteToken,
        quoteVolume.toString(),
        "REP369 Trading Volume"
      );
    }

    const isBuy = repOut > ZERO && quoteIn > ZERO;
    const isSell = repIn > ZERO && quoteOut > ZERO;
    if (!isBuy && !isSell) continue;

    const exactTax = taxByTx.get(txHashOf(swap)) || ZERO;
    if (exactTax === ZERO) continue;

    const side = isBuy ? 0 : 1;
    const totalFeeBps = state.total[side];
    if (totalFeeBps === ZERO) continue;

    const liquidityPart =
      (exactTax * state.liquidity[side]) / totalFeeBps;
    const rewardsPart =
      (exactTax * state.rewards[side]) / totalFeeBps;
    const burnPart = exactTax - liquidityPart - rewardsPart;

    dailyFees.add(
      REP369,
      exactTax.toString(),
      "REP369 Transaction Tax"
    );

    if (liquidityPart > ZERO) {
      dailySupplySideRevenue.add(
        REP369,
        liquidityPart.toString(),
        "Auto Liquidity"
      );
    }

    if (rewardsPart > ZERO) {
      dailyHoldersRevenue.add(
        REP369,
        rewardsPart.toString(),
        "REP Rewards"
      );
      dailyRevenue.add(REP369, rewardsPart.toString(), "REP Rewards");
    }

    if (burnPart > ZERO && state.burn[side] > ZERO) {
      dailyHoldersRevenue.add(
        REP369,
        burnPart.toString(),
        "Token Burns"
      );
      dailyRevenue.add(REP369, burnPart.toString(), "Token Burns");
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "REP369/WPLS PulseX V2 swap volume, counted once per swap using the non-REP369 (quote) leg.",
  UserFees:
    "REP369 transaction taxes paid by traders. Fee components are read from the REP369 contract and fee-update events are applied within each hourly window.",
  Fees:
    "All REP369 transaction tax paid by users, measured from exact REP369 transfers received by the REP369 contract and tied to the corresponding swap transaction.",
  Revenue:
    "The portion of REP369 transaction tax allocated to REP holder rewards and the sell-side burn allocation. Automatic liquidity is treated as supply-side revenue.",
  ProtocolRevenue:
    "No separate protocol treasury share is present in the current REP369 fee configuration.",
  HoldersRevenue:
    "REP rewards plus the REP369 sell-side burn allocation.",
  SupplySideRevenue:
    "The portion of REP369 transaction tax allocated to automatic liquidity.",
};

const breakdownMethodology = {
  Fees: {
    "REP369 Transaction Tax":
      "Exact REP369 tax transfers received by the REP369 contract in the same transaction as the corresponding main-pair swap.",
  },
  Revenue: {
    "REP Rewards":
      "REP369 tax allocated to the REP reward mechanism for holders.",
    "Token Burns":
      "REP369 sell-tax portion permanently burned by the token contract.",
  },
  HoldersRevenue: {
    "REP Rewards":
      "The REP369 tax component allocated to holder rewards.",
    "Token Burns":
      "The REP369 sell-tax component permanently burned by the token contract.",
  },
  SupplySideRevenue: {
    "Auto Liquidity":
      "The REP369 tax component allocated to automatic liquidity.",
  },
};

export default {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PULSECHAIN]: {
      fetch,
      start: "2026-01-16",
    },
  },
  methodology,
  breakdownMethodology,
};
