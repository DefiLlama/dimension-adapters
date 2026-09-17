import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// REP369 token contract. Source: https://scan.pulsechain.com/address/0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369
const REP369 = "0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369".toLowerCase();

// WPLS (wrapped PLS) used by the REP369 PulseX V2 pair. Source: https://scan.pulsechain.com/address/0xA1077a294dDE1B09bB078844df40758a5D0f9a27
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27".toLowerCase();

// REP369/WPLS PulseX V2 pair used by the project. Source: https://scan.pulsechain.com/address/0x240e7A47fE5F91806c6D6056Fe4f62622303E1A5
const MAIN_PAIR = "0x240e7A47fE5F91806c6D6056Fe4f62622303E1A5".toLowerCase();

// ERC-20 zero address; used here only to identify the token contract's burn transfers.
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

// REP369 fee settings are basis points: 10_000 = 100%.
const BPS = 10_000n;
const DEAD_ADDRESS = 0n;

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

const txHashOf = (log: any) =>
  String(log?.transactionHash ?? log?.txHash ?? "").toLowerCase();

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
    ...(burnUpdates || []).map((log: any) => ({ ...log, _kind: "burn" as const })),
    ...(liquidityUpdates || []).map((log: any) => ({
      ...log,
      _kind: "liquidity" as const,
    })),
    ...(rewardUpdates || []).map((log: any) => ({
      ...log,
      _kind: "rewards" as const,
    })),
  ].sort(compareLogs);

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
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let updateIndex = 0;
  const previousSwapByTx = new Map<string, ReturnType<typeof position>>();

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

    const swapPosition = position(swap);
    const transactionHash = txHashOf(swap);
    const txTransfers = transfersByTx.get(transactionHash) || [];
    const previousSwap = previousSwapByTx.get(transactionHash);

    // For transactions with multiple pair swaps, only transfers emitted after
    // the previous swap and before this swap belong to this swap.
    const inCurrentSwapInterval = (log: any) => {
      const p = position(log);
      if (
        p.block !== swapPosition.block ||
        p.tx !== swapPosition.tx ||
        p.log >= swapPosition.log
      ) {
        return false;
      }
      return previousSwap ? p.log > previousSwap.log : true;
    };

    const intervalTransfers = txTransfers.filter(inCurrentSwapInterval);

    // User-facing buy: REP369 leaves the Pair to a non-contract recipient
    // before the corresponding Pair Swap event.
    const isBuy = intervalTransfers.some((log) => {
      const a = argsOf(log);
      const from = String(a.from ?? "").toLowerCase();
      const to = String(a.to ?? "").toLowerCase();
      return (
        from === MAIN_PAIR &&
        to !== MAIN_PAIR &&
        to !== REP369 &&
        to !== ZERO_ADDRESS
      );
    });

    // User-facing sell: REP369 enters the Pair from a non-contract address
    // before the corresponding Pair Swap event.
    const isSell = intervalTransfers.some((log) => {
      const a = argsOf(log);
      const from = String(a.from ?? "").toLowerCase();
      const to = String(a.to ?? "").toLowerCase();
      return (
        to === MAIN_PAIR &&
        from !== REP369 &&
        from !== ZERO_ADDRESS
      );
    });

    if ((!isBuy && !isSell) || (isBuy && isSell)) {
      previousSwapByTx.set(transactionHash, swapPosition);
      continue;
    }

    // Count only the WPLS quote leg once per user trade.
    const quoteVolume = isBuy ? quoteIn : quoteOut;
    if (quoteVolume > ZERO) {
      dailyVolume.add(
        quoteToken,
        quoteVolume.toString(),
        "REP369 Trading Volume"
      );
    }

    let contractTax = ZERO;
    let burnTax = ZERO;

    for (const log of intervalTransfers) {
      const a = argsOf(log);
      const from = String(a.from ?? "").toLowerCase();
      const to = String(a.to ?? "").toLowerCase();
      const value = asBigInt(a.value);
      if (value <= ZERO) continue;

      if (isBuy && from === MAIN_PAIR) {
        if (to === REP369) contractTax += value;
        if (to === ZERO_ADDRESS) burnTax += value;
      } else if (isSell && from !== REP369) {
        if (to === REP369) contractTax += value;
        if (to === ZERO_ADDRESS) burnTax += value;
      }
    }

    // The REP369 contract sends the sell-burn directly to address(0), while
    // liquidity + rewards portions are transferred to the token contract.
    const totalTax = contractTax + burnTax;
    if (totalTax !== ZERO) {
      const side = isBuy ? 0 : 1;
      const liquidityBps = state.liquidity[side];
      const rewardsBps = state.rewards[side];
      const nonBurnBps = liquidityBps + rewardsBps;

      let liquidityPart = ZERO;
      let rewardsPart = ZERO;

      if (contractTax > ZERO && nonBurnBps > ZERO) {
        // Allocate the exact contract-received tax between liquidity and rewards.
        // Assigning the remainder to rewards preserves exact accounting.
        liquidityPart = (contractTax * liquidityBps) / nonBurnBps;
        rewardsPart = contractTax - liquidityPart;
      }

      dailyFees.add(REP369, totalTax.toString(), "REP369 Transaction Tax");

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

      if (burnTax > ZERO) {
        dailyHoldersRevenue.add(
          REP369,
          burnTax.toString(),
          "Token Burns"
        );
        dailyRevenue.add(REP369, burnTax.toString(), "Token Burns");
      }
    }

    // Always advance the transaction's swap boundary, even when this swap was
    // not a user-facing REP369 trade, so its fee transfers cannot be reused.
    previousSwapByTx.set(transactionHash, swapPosition);
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
    "REP369/WPLS PulseX V2 user-trade volume, counted once per swap using the WPLS quote leg.",
  Fees:
    "All REP369 transaction tax paid by users. The adapter reads fee-component settings from the REP369 contract and applies on-chain fee-update events in chronological order.",
  Revenue:
    "REP369 tax allocated to REP holder rewards plus the sell-side burn allocation. Automatic liquidity is treated as supply-side revenue.",
  ProtocolRevenue:
    "No separate protocol treasury fee is present in the current REP369 fee configuration.",
  HoldersRevenue:
    "REP rewards plus the REP369 sell-side burn allocation.",
  SupplySideRevenue:
    "The portion of REP369 transaction tax allocated to automatic liquidity.",
};

const breakdownMethodology = {
  Volume: {
    "REP369 Trading Volume":
      "WPLS quote-side volume from user-facing REP369/WPLS PulseX V2 swaps, counted once per swap.",
  },
  Fees: {
    "REP369 Transaction Tax":
      "Exact REP369 tax transfers associated with user-facing swaps on the main REP369/WPLS pair, including the direct sell-side burn transfer.",
  },
  Revenue: {
    "REP Rewards":
      "REP369 tax allocated to the REP reward mechanism for holders.",
    "Token Burns":
      "REP369 sell-tax portion sent to the ERC-20 zero address by the token contract.",
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

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PULSECHAIN],
  start: "2026-01-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
