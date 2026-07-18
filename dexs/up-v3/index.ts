import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

// UP public launch on Robinhood Chain. Source: first public UP pool deployments on the Robinhood Chain explorer.
const START = "2026-07-10";

// Public UP CL deployment address and first event block on Robinhood Chain.
// Source: Robinhood Chain explorer contract/event history for the CL factory.
const CONFIG = {
  clFactory: "0x1ac9dB4a2608ba45D6127B1737949b51Bb54B7F3",
  clFactoryStartBlock: 6184096,
};

// CLPool.fee returns Uniswap-V3-style pips.
const CL_FEE_DENOMINATOR = 1_000_000;

const eventAbis = {
  poolCreated: "event PoolCreated(address indexed token0,address indexed token1,int24 indexed tickSpacing,address pool)",
  swap:
    "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
  collectFees: "event CollectFees(address indexed recipient,uint128 amount0,uint128 amount1)",
};

const abis = {
  fee: "uint256:fee",
  gaugeFees: "function gaugeFees() view returns (uint128 token0, uint128 token1)",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  VOTER_FEES: "CL Gauge Voter Fees",
  LP_FEES: "CL Liquidity Provider Fees",
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();

function gaugeAmount(value: any, field: "token0" | "token1") {
  const index = field === "token0" ? 0 : 1;
  return toBN(value?.[field] ?? value?.[index] ?? 0);
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolCreatedLogs = await getLogs({
    target: CONFIG.clFactory,
    fromBlock: CONFIG.clFactoryStartBlock,
    eventAbi: eventAbis.poolCreated,
    onlyArgs: true,
    cacheInCloud: true,
  });

  if (!poolCreatedLogs.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = poolCreatedLogs.map((pool) => pool.pool.toLowerCase());
  const fees = await api.multiCall({ abi: abis.fee, calls: poolIds });
  const gaugeFeesStart = await fromApi.multiCall({ abi: abis.gaugeFees, calls: poolIds, permitFailure: true });
  const gaugeFeesEnd = await api.multiCall({ abi: abis.gaugeFees, calls: poolIds, permitFailure: true });

  const poolInfo: Record<string, { token0: string; token1: string; fee: BigNumber }> = {};
  poolCreatedLogs.forEach((pool, index) => {
    poolInfo[pool.pool.toLowerCase()] = {
      token0: pool.token0,
      token1: pool.token1,
      fee: toBN(fees[index], `${pool.pool} CL fee`).div(CL_FEE_DENOMINATOR),
    };
  });

  const swapLogsByPool = await getLogs({
    targets: poolIds,
    eventAbi: eventAbis.swap,
    flatten: false,
  });

  const poolFeeTotals: Record<string, { fee0: BigNumber; fee1: BigNumber }> = {};
  swapLogsByPool.forEach((logs, index) => {
    const pool = poolIds[index];
    const info = poolInfo[pool];
    if (!info) return;

    const { token0, token1, fee } = info;

    for (const log of logs) {
      const amount0 = absBN(log.amount0);
      const amount1 = absBN(log.amount1);
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });

      if (!poolFeeTotals[pool]) poolFeeTotals[pool] = { fee0: new BigNumber(0), fee1: new BigNumber(0) };
      if (toBN(log.amount0).gt(0)) poolFeeTotals[pool].fee0 = poolFeeTotals[pool].fee0.plus(amount0.times(fee));
      if (toBN(log.amount1).gt(0)) poolFeeTotals[pool].fee1 = poolFeeTotals[pool].fee1.plus(amount1.times(fee));
    }
  });

  const collectLogsByPool = await getLogs({
    targets: poolIds,
    eventAbi: eventAbis.collectFees,
    flatten: false,
  });

  const collectedByPool: Record<string, { c0: BigNumber; c1: BigNumber }> = {};
  collectLogsByPool.forEach((logs, index) => {
    const pool = poolIds[index];
    for (const log of logs) {
      if (!collectedByPool[pool]) collectedByPool[pool] = { c0: new BigNumber(0), c1: new BigNumber(0) };
      collectedByPool[pool].c0 = collectedByPool[pool].c0.plus(toBN(log.amount0));
      collectedByPool[pool].c1 = collectedByPool[pool].c1.plus(toBN(log.amount1));
    }
  });

  poolCreatedLogs.forEach(({ token0, token1, pool }, index) => {
    const poolId = pool.toLowerCase();
    const totals = poolFeeTotals[poolId];
    if (!totals || (totals.fee0.isZero() && totals.fee1.isZero())) return;

    const collected = collectedByPool[poolId] ?? { c0: new BigNumber(0), c1: new BigNumber(0) };
    let holders0 = gaugeAmount(gaugeFeesEnd[index], "token0")
      .minus(gaugeAmount(gaugeFeesStart[index], "token0"))
      .plus(collected.c0);
    let holders1 = gaugeAmount(gaugeFeesEnd[index], "token1")
      .minus(gaugeAmount(gaugeFeesStart[index], "token1"))
      .plus(collected.c1);

    if (holders0.lt(0)) holders0 = new BigNumber(0);
    if (holders1.lt(0)) holders1 = new BigNumber(0);
    if (holders0.gt(totals.fee0)) holders0 = totals.fee0;
    if (holders1.gt(totals.fee1)) holders1 = totals.fee1;

    const supply0 = totals.fee0.minus(holders0);
    const supply1 = totals.fee1.minus(holders1);

    if (totals.fee0.gt(0)) {
      dailyFees.add(token0, totals.fee0.toFixed(0), METRIC.SWAP_FEES);
      dailyUserFees.add(token0, totals.fee0.toFixed(0), METRIC.SWAP_FEES);
    }
    if (totals.fee1.gt(0)) {
      dailyFees.add(token1, totals.fee1.toFixed(0), METRIC.SWAP_FEES);
      dailyUserFees.add(token1, totals.fee1.toFixed(0), METRIC.SWAP_FEES);
    }
    if (holders0.gt(0)) dailyHoldersRevenue.add(token0, holders0.toFixed(0), METRIC.VOTER_FEES);
    if (holders1.gt(0)) dailyHoldersRevenue.add(token1, holders1.toFixed(0), METRIC.VOTER_FEES);
    if (supply0.gt(0)) dailySupplySideRevenue.add(token0, supply0.toFixed(0), METRIC.LP_FEES);
    if (supply1.gt(0)) dailySupplySideRevenue.add(token1, supply1.toFixed(0), METRIC.LP_FEES);
  });

  dailyRevenue.add(dailyHoldersRevenue);

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume from UP concentrated liquidity pools on Robinhood Chain. Each swap is counted once on the pricing side of the pair.",
  Fees: "Total concentrated liquidity swap fees paid by traders, valued on the same pricing side used for volume. Fees use CLPool.fee(), where 3000 means 0.30%.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "Concentrated liquidity fees routed to veUP voters through gauges, equal to HoldersRevenue.",
  HoldersRevenue: "Voter fee share is measured from CLPool.gaugeFees() deltas plus CollectFees events and applied per token.",
  SupplySideRevenue: "Concentrated liquidity provider fees not routed to veUP voters.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid by traders.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veUP voters.",
  },
  HoldersRevenue: {
    [METRIC.VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veUP voters.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Concentrated liquidity swap fees retained by liquidity providers after gauge-routed fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
