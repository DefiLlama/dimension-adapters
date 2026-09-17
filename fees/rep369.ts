import { FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const REP369 = "0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369".toLowerCase();
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27".toLowerCase();
const MAIN_PAIR = "0x240e7A47fE5F91806c6D6056Fe4f62622303E1A5".toLowerCase();

const BPS = 10_000n;
const ZERO = 0n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

const position = (log: any) => ({
  block: Number(log?.blockNumber ?? 0),
  tx: Number(log?.transactionIndex ?? 0),
  log: Number(log?.logIndex ?? 0),
});

const compareLogs = (a: any, b: any) => {
  const pa = position(a);
  const pb = position(b);
  return pa.block - pb.block || pa.tx - pb.tx || pa.log - pb.log;
};

const recalcTotal = (state: FeeState) => {
  state.total[0] = state.liquidity[0] + state.rewards[0] + state.burn[0];
  state.total[1] = state.liquidity[1] + state.rewards[1] + state.burn[1];
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
        options.fromApi.call({ target: REP369, abi: ABIS.liquidityFees, params: [0] }),
        options.fromApi.call({ target: REP369, abi: ABIS.liquidityFees, params: [1] }),
      ]),
      Promise.all([
        options.fromApi.call({ target: REP369, abi: ABIS.rewardsFees, params: [0] }),
        options.fromApi.call({ target: REP369, abi: ABIS.rewardsFees, params: [1] }),
      ]),
      Promise.all([
        options.fromApi.call({ target: REP369, abi: ABIS.autoBurnFees, params: [0] }),
        options.fromApi.call({ target: REP369, abi: ABIS.autoBurnFees, params: [1] }),
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
    ...(burnUpdates || []).map((log: any) => ({ ...log, _kind: "burn" as const })),
    ...(liquidityUpdates || []).map((log: any) => ({ ...log, _kind: "liquidity" as const })),
    ...(rewardUpdates || []).map((log: any) => ({ ...log, _kind: "rewards" as const })),
  ].sort(compareLogs);

  // Used only to distinguish user-facing swaps from internal REP369 tax/reward swaps.
  const transfersByTx = new Map<string, any[]>();
  for (const log of transferLogs || []) {
    const tx = txHashOf(log);
    if (!tx) continue;
    const list = transfersByTx.get(tx) || [];
    list.push(log);
    transfersByTx.set(tx, list);
  }
  for (const list of transfersByTx.values()) list.sort(compareLogs);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let updateIndex = 0;

  for (const swap of [...(swapLogs || [])].sort(compareLogs)) {
    while (
      updateIndex < updates.length &&
      compareLogs(updates[updateIndex], swap) <= 0
    ) {
      applyFeeUpdate(state, updates[updateIndex], updates[updateIndex]._kind);
      updateIndex++;
    }

    const args = argsOf(swap);
    const repIn = asBigInt(repIs0 ? args.amount0In : args.amount1In);
    const repOut = asBigInt(repIs0 ? args.amount0Out : args.amount1Out);
    const quoteIn = asBigInt(repIs0 ? args.amount1In : args.amount0In);
    const quoteOut = asBigInt(repIs0 ? args.amount1Out : args.amount0Out);

    const transfers = transfersByTx.get(txHashOf(swap)) || [];
    const swapPos = position(swap);

    // In a user sell, REP369 is transferred from the user to the pair before
    // the Pair Swap event. Internal fee/reward sells originate from REP369 itself.
    const hasUserSellTransfer = transfers.some((log) => {
      const p = position(log);
      const a = argsOf(log);
      const from = String(a.from ?? "").toLowerCase();
      const to = String(a.to ?? "").toLowerCase();
      return (
        p.block === swapPos.block &&
        p.tx === swapPos.tx &&
        p.log < swapPos.log &&
        to === MAIN_PAIR &&
        from !== REP369 &&
        from !== ZERO_ADDRESS
      );
    });

    // In a user buy, the Pair transfers REP369 outward before the Pair Swap event.
    const hasUserBuyTransfer = transfers.some((log) => {
      const p = position(log);
      const a = argsOf(log);
      const from = String(a.from ?? "").toLowerCase();
      const to = String(a.to ?? "").toLowerCase();
      return (
        p.block === swapPos.block &&
        p.tx === swapPos.tx &&
        p.log < swapPos.log &&
        from === MAIN_PAIR &&
        to !== MAIN_PAIR &&
        to !== REP369 &&
        to !== ZERO_ADDRESS
      );
    });

    const isBuy = repOut > ZERO && quoteIn > ZERO && hasUserBuyTransfer;
    const isSell = repIn > ZERO && quoteOut > ZERO && hasUserSellTransfer;

    if (!isBuy && !isSell) continue;

    // Count the quote leg once per user-facing swap.
    const quoteVolume = isBuy ? quoteIn : quoteOut;
    if (quoteVolume > ZERO) {
      dailyVolume.add(quoteToken, quoteVolume.toString());
    }

    const side = isBuy ? 0 : 1;
    const totalFeeBps = state.total[side];
    if (totalFeeBps === ZERO || totalFeeBps >= BPS) continue;

    // REP369 calculates the total fee first, then allocates that fee across
    // liquidity, rewards and burn components. This mirrors the Solidity logic.
    const grossRep = isBuy
      ? repOut
      : (repIn * BPS + (BPS - totalFeeBps) - 1n) /
        (BPS - totalFeeBps);

    const totalTax = (grossRep * totalFeeBps) / BPS;
    const liquidityPart =
      (totalTax * state.liquidity[side]) / totalFeeBps;
    const rewardsPart =
      (totalTax * state.rewards[side]) / totalFeeBps;
    const burnPart =
      (totalTax * state.burn[side]) / totalFeeBps;

    if (totalTax > ZERO) {
      dailyFees.add(REP369, totalTax.toString(), "REP369 Transaction Tax");
    }

    if (rewardsPart > ZERO) {
      dailyRevenue.add(REP369, rewardsPart.toString(), "REP Rewards");
      dailyHoldersRevenue.add(REP369, rewardsPart.toString(), "REP Rewards");
    }

    if (burnPart > ZERO) {
      dailyRevenue.add(REP369, burnPart.toString(), "Token Burns");
      dailyHoldersRevenue.add(REP369, burnPart.toString(), "Token Burns");
    }

    if (liquidityPart > ZERO) {
      dailySupplySideRevenue.add(
        REP369,
        liquidityPart.toString(),
        "Auto Liquidity"
      );
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "REP369/WPLS PulseX V2 user-trade volume, counted once per swap using the WPLS quote leg. Internal REP369 fee/reward swaps are excluded using on-chain Transfer ordering.",
  UserFees:
    "REP369 transaction taxes paid by traders. Fee components are read from the REP369 contract and fee-update events are applied within each hourly window.",
  Fees:
    "All REP369 transaction tax paid by users, including the liquidity, REP reward and burn allocations.",
  Revenue:
    "REP holder rewards and the sell-side burn allocation. There is no separate protocol treasury share in the current REP369 fee configuration.",
  ProtocolRevenue:
    "Zero: the current REP369 fee configuration has no separate treasury/protocol share.",
  HoldersRevenue:
    "REP rewards plus the REP369 sell-side burn allocation.",
  SupplySideRevenue:
    "The portion of REP369 transaction tax allocated to automatic liquidity.",
};

const breakdownMethodology = {
  Fees: {
    "REP369 Transaction Tax":
      "Total REP369 buy/sell tax calculated from the on-chain fee configuration and the gross traded REP369 amount. Buy tax is applied to the pair's gross REP369 output; sell gross amount is reconstructed from the pair's net REP369 input.",
  },
  UserFees: {
    "REP369 Transaction Tax":
      "Transaction tax paid by REP369 users on buys and sells.",
  },
  Revenue: {
    "REP Rewards":
      "The REP369 tax portion allocated to the REP reward mechanism for holders.",
    "Token Burns":
      "The REP369 sell-tax burn allocation sent to the burn address by the token contract.",
  },
  ProtocolRevenue: {},
  HoldersRevenue: {
    "REP Rewards":
      "The REP369 tax portion allocated to holder rewards.",
    "Token Burns":
      "The REP369 sell-tax burn allocation permanently burned by the token contract.",
  },
  SupplySideRevenue: {
    "Auto Liquidity":
      "The REP369 tax portion allocated to automatic liquidity.",
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
