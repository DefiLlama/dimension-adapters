import { FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * REP369 fees / revenue / volume adapter for PulseChain.
 *
 * REP369 source contract supplied for this listing:
 * - buy fee components: liquidity 200 bps + rewards 100 bps + burn 0 bps
 * - sell fee components: liquidity 400 bps + rewards 400 bps + burn 100 bps
 *
 * The contract owner can update these components. This adapter therefore reads
 * the fee arrays at the start of each fetch window and applies any fee-update
 * events occurring inside that window instead of hard-coding rates forever.
 *
 * Public project / source reference:
 * https://www.reptalianie.com/
 */

const REP369 = "0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369".toLowerCase();
const ZERO = 0n;
const BPS = 10_000n;

const EVENTS = {
  swap:
    "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
  autoBurnUpdated:
    "event AutoBurnFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
  liquidityUpdated:
    "event LiquidityFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
  rewardsUpdated:
    "event RewardsFeesUpdated(uint16 buyFee,uint16 sellFee,uint16 transferFee)",
};

const ABIS = {
  pairV2: "address:pairV2",
  token0: "address:token0",
  token1: "address:token1",
  totalFees: "uint16:totalFees",
  liquidityFees: "uint16:liquidityFees",
  rewardsFees: "uint16:rewardsFees",
  autoBurnFees: "uint16:autoBurnFees",
};

type FeeState = {
  total: [bigint, bigint];
  liquidity: [bigint, bigint];
  rewards: [bigint, bigint];
  burn: [bigint, bigint];
};

const asBigInt = (value: any): bigint => BigInt(value ?? 0);

const eventPosition = (log: any) => ({
  block: Number(log.blockNumber ?? 0),
  tx: Number(log.transactionIndex ?? 0),
  log: Number(log.logIndex ?? 0),
});

const comparePosition = (a: any, b: any) => {
  const pa = eventPosition(a);
  const pb = eventPosition(b);
  return pa.block - pb.block || pa.tx - pb.tx || pa.log - pb.log;
};

const applyFeeUpdate = (state: FeeState, log: any, kind: "burn" | "liquidity" | "rewards") => {
  const target = kind === "burn" ? state.burn : kind === "liquidity" ? state.liquidity : state.rewards;
  const buyFee = asBigInt(log.buyFee);
  const sellFee = asBigInt(log.sellFee);
  target[0] = buyFee;
  target[1] = sellFee;

  state.total[0] = state.liquidity[0] + state.rewards[0] + state.burn[0];
  state.total[1] = state.liquidity[1] + state.rewards[1] + state.burn[1];
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  if (options.chain !== CHAIN.PULSECHAIN) throw new Error("REP369 only supports PulseChain");

  const [pairResult, startTotal, startLiquidity, startRewards, startBurn] = await Promise.all([
    options.api.call({ target: REP369, abi: ABIS.pairV2 }),
    options.fromApi.multiCall({
      abi: ABIS.totalFees,
      calls: [{ target: REP369, params: [0] }, { target: REP369, params: [1] }],
    }),
    options.fromApi.multiCall({
      abi: ABIS.liquidityFees,
      calls: [{ target: REP369, params: [0] }, { target: REP369, params: [1] }],
    }),
    options.fromApi.multiCall({
      abi: ABIS.rewardsFees,
      calls: [{ target: REP369, params: [0] }, { target: REP369, params: [1] }],
    }),
    options.fromApi.multiCall({
      abi: ABIS.autoBurnFees,
      calls: [{ target: REP369, params: [0] }, { target: REP369, params: [1] }],
    }),
  ]);

  const pair = String(pairResult).toLowerCase();
  if (!pair || pair === "0x0000000000000000000000000000000000000000") {
    return {};
  }

  const [token0Result, token1Result] = await Promise.all([
    options.api.call({ target: pair, abi: ABIS.token0 }),
    options.api.call({ target: pair, abi: ABIS.token1 }),
  ]);

  const token0 = String(token0Result).toLowerCase();
  const token1 = String(token1Result).toLowerCase();

  if (![token0, token1].includes(REP369)) throw new Error("REP369 pairV2 is not a REP369 pair");

  const repIs0 = token0 === REP369;
  const quoteToken = repIs0 ? token1 : token0;

  const state: FeeState = {
    total: [asBigInt(startTotal[0]), asBigInt(startTotal[1])],
    liquidity: [asBigInt(startLiquidity[0]), asBigInt(startLiquidity[1])],
    rewards: [asBigInt(startRewards[0]), asBigInt(startRewards[1])],
    burn: [asBigInt(startBurn[0]), asBigInt(startBurn[1])],
  };

  // Keep the state internally consistent in case a future contract version
  // exposes a totalFees value that includes another component.
  state.total[0] = state.liquidity[0] + state.rewards[0] + state.burn[0];
  state.total[1] = state.liquidity[1] + state.rewards[1] + state.burn[1];

  const [swapLogs, burnUpdates, liquidityUpdates, rewardUpdates] = await Promise.all([
    options.getLogs({ target: pair, eventAbi: EVENTS.swap, entireLog: true, parseLog: true }),
    options.getLogs({ target: REP369, eventAbi: EVENTS.autoBurnUpdated, entireLog: true, parseLog: true }),
    options.getLogs({ target: REP369, eventAbi: EVENTS.liquidityUpdated, entireLog: true, parseLog: true }),
    options.getLogs({ target: REP369, eventAbi: EVENTS.rewardsUpdated, entireLog: true, parseLog: true }),
  ]);

  const updates = [
    ...(burnUpdates || []).map((log: any) => ({ ...log, _kind: "burn" as const })),
    ...(liquidityUpdates || []).map((log: any) => ({ ...log, _kind: "liquidity" as const })),
    ...(rewardUpdates || []).map((log: any) => ({ ...log, _kind: "rewards" as const })),
  ].sort(comparePosition);

  const swaps = [...(swapLogs || [])].sort(comparePosition);
  let updateIndex = 0;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const log of swaps) {
    while (updateIndex < updates.length && comparePosition(updates[updateIndex], log) <= 0) {
      applyFeeUpdate(state, updates[updateIndex], updates[updateIndex]._kind);
      updateIndex++;
    }

    const repIn = asBigInt(repIs0 ? log.args.amount0In : log.args.amount1In);
    const repOut = asBigInt(repIs0 ? log.args.amount0Out : log.args.amount1Out);
    const quoteIn = asBigInt(repIs0 ? log.args.amount1In : log.args.amount0In);
    const quoteOut = asBigInt(repIs0 ? log.args.amount1Out : log.args.amount0Out);

    // Count volume once per swap using the non-REP369 (quote) leg.
    const quoteVolume = quoteIn > ZERO ? quoteIn : quoteOut;
    if (quoteVolume > ZERO) {
      dailyVolume.add(quoteToken, quoteVolume.toString(), "REP369 Trading Volume");
    }

    if (repOut > ZERO && quoteIn > ZERO) {
      // BUY: PulseX sends gross REP369 to the buyer. The token contract deducts
      // the configured buy tax from that gross amount.
      const totalTax = repOut * state.total[0] / BPS;
      const liquidityTax = repOut * state.liquidity[0] / BPS;
      const holderTax = repOut * state.rewards[0] / BPS;
      const burnTax = repOut * state.burn[0] / BPS;

      if (totalTax > ZERO) dailyFees.add(REP369, totalTax.toString(), "REP369 Transaction Tax");
      if (holderTax > ZERO) dailyHoldersRevenue.add(REP369, holderTax.toString(), "REP Rewards");
      if (liquidityTax > ZERO) dailySupplySideRevenue.add(REP369, liquidityTax.toString(), "Auto Liquidity");
      if (holderTax > ZERO) dailyRevenue.add(REP369, holderTax.toString(), "REP Rewards");
      if (burnTax > ZERO) {
        dailyRevenue.add(REP369, burnTax.toString(), "Token Burns");
        dailyProtocolRevenue.add(REP369, burnTax.toString(), "Token Burns");
      }
    } else if (repIn > ZERO && quoteOut > ZERO) {
      // SELL: the Pair receives 91% of the gross amount at the initial 9% tax.
      // More generally, netPairAmount = gross * (1 - totalTax), so recover gross
      // from the actual REP369 amountIn seen by the Pair.
      const sellTotalBps = state.total[1];
      if (sellTotalBps >= BPS) throw new Error("REP369 sell fee is >= 100%");
      const gross = repIn * BPS / (BPS - sellTotalBps);
      const liquidityTax = gross * state.liquidity[1] / BPS;
      const holderTax = gross * state.rewards[1] / BPS;
      const burnTax = gross * state.burn[1] / BPS;
      const totalTax = liquidityTax + holderTax + burnTax;

      if (totalTax > ZERO) dailyFees.add(REP369, totalTax.toString(), "REP369 Transaction Tax");
      if (holderTax > ZERO) dailyHoldersRevenue.add(REP369, holderTax.toString(), "REP Rewards");
      if (liquidityTax > ZERO) dailySupplySideRevenue.add(REP369, liquidityTax.toString(), "Auto Liquidity");
      if (holderTax > ZERO) dailyRevenue.add(REP369, holderTax.toString(), "REP Rewards");
      if (burnTax > ZERO) {
        dailyRevenue.add(REP369, burnTax.toString(), "Token Burns");
        dailyProtocolRevenue.add(REP369, burnTax.toString(), "Token Burns");
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "REP369/WPLS PulseX V2 swap volume, counted once per swap using the non-REP369 (quote) leg.",
  UserFees:
    "REP369 transaction taxes paid by traders. The adapter reads the fee-component settings from the REP369 contract and applies any fee-update events in the hourly window.",
  Fees:
    "All REP369 transaction tax paid by users. The initial configuration is 3% on buys and 9% on sells; the adapter follows subsequent on-chain fee updates.",
  Revenue:
    "REP holder reward allocation plus the sell-side burn allocation. Automatic liquidity is classified as supply-side revenue.",
  ProtocolRevenue:
    "The sell-side burn allocation. REP369 has no separate protocol treasury fee component in its current fee configuration.",
  HoldersRevenue:
    "The portion of REP369 transaction tax allocated to REP rewards: initially 1% on buys and 4% on sells, subject to on-chain fee updates.",
  SupplySideRevenue:
    "The portion of REP369 transaction tax allocated to automatic liquidity: initially 2% on buys and 4% on sells, subject to on-chain fee updates.",
};

const breakdownMethodology = {
  Fees: {
    "REP369 Transaction Tax":
      "Total transaction tax paid on REP369 buys and sells, calculated from the on-chain fee-component configuration and the traded REP369 amount.",
  },
  Revenue: {
    "REP Rewards":
      "REP369 tax allocated to the REP reward mechanism for holders.",
    "Token Burns":
      "REP369 sell-tax component sent directly to the burn address by the token contract.",
  },
  HoldersRevenue: {
    "REP Rewards":
      "The REP369 tax component allocated to holder rewards. The initial configuration is 1% on buys and 4% on sells.",
  },
  SupplySideRevenue: {
    "Auto Liquidity":
      "The REP369 tax component allocated to automatic liquidity. The initial configuration is 2% on buys and 4% on sells.",
  },
  ProtocolRevenue: {
    "Token Burns":
      "The REP369 sell-tax burn component. The initial configuration is 1% of the gross sell amount.",
  },
};

export default {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PULSECHAIN]: {
      fetch,
      start: "2023-05-13",
    },
  },
  methodology,
  breakdownMethodology,
};
