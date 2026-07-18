import { Balances, ChainApi } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { isCoreAsset } from "../../helpers/prices";

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
const CALL_DELAY_MS = 150;

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

type PoolLog = {
  token0: string;
  token1: string;
  pool: string;
  blockNumber?: number;
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();

function requiredGaugeFees(value: any, context: string) {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return {
    token0: toBN(value.token0 ?? value[0], `${context} token0`),
    token1: toBN(value.token1 ?? value[1], `${context} token1`),
  };
}

function normalizePoolLog(log: any): PoolLog {
  const args = log.args ?? log;
  const blockNumber = log.blockNumber ?? log.block_number;
  return {
    token0: args.token0,
    token1: args.token1,
    pool: args.pool,
    blockNumber: blockNumber === undefined ? undefined : Number(blockNumber),
  };
}

function addAmount(balances: Balances, token: string, amount: BigNumber, label?: string) {
  if (!amount.gt(0)) return;
  if (label) balances.add(token, amount.toFixed(0), label);
  else balances.add(token, amount.toFixed(0));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callByPool(api: ChainApi, poolIds: string[], abi: string, permitFailure = false) {
  const results: any[] = [];
  for (const pool of poolIds) {
    results.push(await api.call({ target: pool, abi, permitFailure }));
    await sleep(CALL_DELAY_MS);
  }
  return results;
}

function getPricedAmount(
  chain: string,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
): { token: string; amount: BigNumber } {
  if (isCoreAsset(chain, token0)) return { token: token0, amount: amount0 };
  return { token: token1, amount: amount1 };
}

function addPricedAmount(
  chain: string,
  balances: Balances,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
  label?: string,
) {
  const { token, amount } = getPricedAmount(chain, token0, token1, amount0, amount1);
  addAmount(balances, token, amount, label);
}

function convertToPricedAmount(
  chain: string,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
  volume0: BigNumber,
  volume1: BigNumber,
): { token: string; amount: BigNumber } {
  if (isCoreAsset(chain, token0)) {
    const converted1 = volume1.gt(0) ? amount1.times(volume0).div(volume1) : new BigNumber(0);
    return { token: token0, amount: amount0.plus(converted1) };
  }

  const converted0 = volume0.gt(0) ? amount0.times(volume1).div(volume0) : new BigNumber(0);
  return { token: token1, amount: amount1.plus(converted0) };
}

async function getLogsByPool(
  options: FetchOptions,
  poolIds: string[],
  eventAbi: string,
  fromBlock: number,
  toBlock: number,
) {
  const logsByPool: any[][] = [];
  for (const pool of poolIds) {
    const logs = await options.getLogs({
      target: pool,
      fromBlock,
      toBlock,
      eventAbi,
    });
    logsByPool.push(logs as any[]);
  }
  return logsByPool;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const rawPools = (
    (await getLogs({
      target: CONFIG.clFactory,
      fromBlock: CONFIG.clFactoryStartBlock,
      toBlock,
      eventAbi: eventAbis.poolCreated,
      entireLog: true,
      skipCacheRead: true,
    })) as any[]
  ).map(normalizePoolLog);

  if (!rawPools.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = rawPools.map((pool) => pool.pool.toLowerCase());
  const fees = await callByPool(api, poolIds, abis.fee);
  const gaugeFeesStart = await callByPool(fromApi, poolIds, abis.gaugeFees, true);
  const gaugeFeesEnd = await callByPool(api, poolIds, abis.gaugeFees);

  const poolInfo: Record<string, { token0: string; token1: string; fee: BigNumber }> = {};
  rawPools.forEach((pool, index) => {
    poolInfo[pool.pool.toLowerCase()] = {
      token0: pool.token0,
      token1: pool.token1,
      fee: toBN(fees[index], `${pool.pool} CL fee`).div(CL_FEE_DENOMINATOR),
    };
  });

  const swapLogsByPool = await getLogsByPool(options, poolIds, eventAbis.swap, fromBlock, toBlock);

  const poolFeeTotals: Record<
    string,
    {
      fee0: BigNumber;
      fee1: BigNumber;
      pricedFee: BigNumber;
      pricedToken: string;
      volume0: BigNumber;
      volume1: BigNumber;
    }
  > = {};
  (swapLogsByPool as any[][]).forEach((logs, index) => {
    const pool = poolIds[index];
    const info = poolInfo[pool];
    if (!info) return;

    for (const log of logs) {
      const amount0 = absBN(log.amount0);
      const amount1 = absBN(log.amount1);
      addPricedAmount(chain, dailyVolume, info.token0, info.token1, amount0, amount1);

      if (!poolFeeTotals[pool]) {
        poolFeeTotals[pool] = {
          fee0: new BigNumber(0),
          fee1: new BigNumber(0),
          pricedFee: new BigNumber(0),
          pricedToken: getPricedAmount(chain, info.token0, info.token1, new BigNumber(0), new BigNumber(0)).token,
          volume0: new BigNumber(0),
          volume1: new BigNumber(0),
        };
      }
      poolFeeTotals[pool].volume0 = poolFeeTotals[pool].volume0.plus(amount0);
      poolFeeTotals[pool].volume1 = poolFeeTotals[pool].volume1.plus(amount1);
      if (toBN(log.amount0).gt(0)) poolFeeTotals[pool].fee0 = poolFeeTotals[pool].fee0.plus(amount0.times(info.fee));
      if (toBN(log.amount1).gt(0)) poolFeeTotals[pool].fee1 = poolFeeTotals[pool].fee1.plus(amount1.times(info.fee));
      poolFeeTotals[pool].pricedFee = poolFeeTotals[pool].pricedFee.plus(
        getPricedAmount(chain, info.token0, info.token1, amount0.times(info.fee), amount1.times(info.fee)).amount,
      );
    }
  });

  const collectLogsByPool = await getLogsByPool(options, poolIds, eventAbis.collectFees, fromBlock, toBlock);

  const collectedByPool: Record<string, { c0: BigNumber; c1: BigNumber }> = {};
  (collectLogsByPool as any[][]).forEach((logs, index) => {
    const pool = poolIds[index];
    for (const log of logs) {
      if (!collectedByPool[pool]) collectedByPool[pool] = { c0: new BigNumber(0), c1: new BigNumber(0) };
      collectedByPool[pool].c0 = collectedByPool[pool].c0.plus(toBN(log.amount0));
      collectedByPool[pool].c1 = collectedByPool[pool].c1.plus(toBN(log.amount1));
    }
  });

  rawPools.forEach((poolLog, index) => {
    const pool = poolLog.pool.toLowerCase();
    const totals = poolFeeTotals[pool];
    if (!totals || (totals.fee0.isZero() && totals.fee1.isZero())) return;

    const createdAfterWindowStart = poolLog.blockNumber !== undefined && poolLog.blockNumber > fromBlock;
    const start =
      gaugeFeesStart[index] === null || gaugeFeesStart[index] === undefined
        ? createdAfterWindowStart
          ? { token0: new BigNumber(0), token1: new BigNumber(0) }
          : requiredGaugeFees(gaugeFeesStart[index], `${pool} gaugeFees at fromBlock`)
        : requiredGaugeFees(gaugeFeesStart[index], `${pool} gaugeFees at fromBlock`);
    const end = requiredGaugeFees(gaugeFeesEnd[index], `${pool} gaugeFees at toBlock`);
    const collected = collectedByPool[pool] ?? { c0: new BigNumber(0), c1: new BigNumber(0) };

    let holders0 = end.token0.minus(start.token0).plus(collected.c0);
    let holders1 = end.token1.minus(start.token1).plus(collected.c1);
    if (holders0.lt(0)) holders0 = new BigNumber(0);
    if (holders1.lt(0)) holders1 = new BigNumber(0);
    if (holders0.gt(totals.fee0)) holders0 = totals.fee0;
    if (holders1.gt(totals.fee1)) holders1 = totals.fee1;

    const actualFees = convertToPricedAmount(
      chain,
      poolLog.token0,
      poolLog.token1,
      totals.fee0,
      totals.fee1,
      totals.volume0,
      totals.volume1,
    );
    const actualHolders = convertToPricedAmount(
      chain,
      poolLog.token0,
      poolLog.token1,
      holders0,
      holders1,
      totals.volume0,
      totals.volume1,
    );
    const holdersShare = actualFees.amount.gt(0)
      ? BigNumber.min(actualHolders.amount.div(actualFees.amount), 1)
      : new BigNumber(0);
    const holders = totals.pricedFee.times(holdersShare);

    addAmount(dailyFees, totals.pricedToken, totals.pricedFee, METRIC.SWAP_FEES);
    addAmount(dailyUserFees, totals.pricedToken, totals.pricedFee, METRIC.SWAP_FEES);
    addAmount(dailyHoldersRevenue, totals.pricedToken, holders, METRIC.VOTER_FEES);
    addAmount(dailySupplySideRevenue, totals.pricedToken, totals.pricedFee.minus(holders), METRIC.LP_FEES);
  });

  dailyRevenue.add(dailyHoldersRevenue);

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume from UP concentrated liquidity pools on Robinhood Chain. Each swap is counted once on the pricing side of the pair.",
  Fees: "Total concentrated liquidity swap fees paid by traders, valued on the same pricing side used for volume. Fees use CLPool.fee(), where 3000 means 0.30%.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "Concentrated liquidity fees routed to veUP voters through gauges, equal to HoldersRevenue.",
  HoldersRevenue: "Voter fee share is measured from CLPool.gaugeFees() deltas plus CollectFees events and applied to the priced fee total.",
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
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
