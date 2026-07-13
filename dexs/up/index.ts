import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { isCoreAsset } from "../../helpers/prices";

// UP public launch on Robinhood Chain. Source: first public UP pool deployments on the Robinhood Chain explorer.
const START = "2026-07-10";

// Public UP protocol deployment addresses and first event blocks on Robinhood Chain.
// Source: Robinhood Chain explorer contract/event history for the voter, v2 factory, and CL factory.
const CONFIG = {
  voter: "0x7F749fDD351C1Ceed82d76d7699CB631Eb8332a7",
  v2Factory: "0xFA5429AEBa338BEa2BFcc1b9a889862Ee395bc28",
  v2GaugeFactory: "0x6df2E93cc56E96330dce2B60e34D88AF3EF23580",
  clFactory: "0x1ac9dB4a2608ba45D6127B1737949b51Bb54B7F3",
  v2FactoryStartBlock: 6180950,
  clFactoryStartBlock: 6184096,
  voterStartBlock: 6181013,
};

// V2 PoolFactory.getFee returns basis points; CLPool.fee returns Uniswap-V3-style pips.
const V2_FEE_DENOMINATOR = 10_000;
const CL_FEE_DENOMINATOR = 1_000_000;

const eventAbis = {
  v2PoolCreated:
    "event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)",
  v2Swap:
    "event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)",
  clPoolCreated:
    "event PoolCreated(address indexed token0,address indexed token1,int24 indexed tickSpacing,address pool)",
  clSwap:
    "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
  collectFees: "event CollectFees(address indexed recipient,uint128 amount0,uint128 amount1)",
  gaugeCreated:
    "event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)",
};

const abis = {
  v2Fee: "function getFee(address pool, bool stable) view returns (uint256)",
  clFee: "uint256:fee",
  gaugeFees: "function gaugeFees() view returns (uint128 token0, uint128 token1)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
  totalSupply: "erc20:totalSupply",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  V2_VOTER_FEES: "V2 Gauge Voter Fees",
  CL_VOTER_FEES: "CL Gauge Voter Fees",
  V2_LP_FEES: "V2 Liquidity Provider Fees",
  CL_LP_FEES: "CL Liquidity Provider Fees",
};

type PoolLog = {
  token0: string;
  token1: string;
  pool: string;
  stable?: boolean;
  blockNumber?: number;
};

type GaugeMetadata = {
  v2PoolToGauge: Map<string, string>;
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
    stable: args.stable,
    blockNumber: blockNumber === undefined ? undefined : Number(blockNumber),
  };
}

function addAmount(balances: Balances, token: string, amount: BigNumber, label?: string) {
  if (!amount.gt(0)) return;
  if (label) balances.add(token, amount.toFixed(0), label);
  else balances.add(token, amount.toFixed(0));
}

function getPricedAmount(
  chain: string,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
): { token: string; amount: BigNumber } {
  if (isCoreAsset(chain, token0)) {
    return { token: token0, amount: amount0 };
  }

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
  return { token, amount };
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

async function getGaugeMetadata(options: FetchOptions, toBlock: number): Promise<GaugeMetadata> {
  const logs = await options.getLogs({
    target: CONFIG.voter,
    fromBlock: CONFIG.voterStartBlock,
    toBlock,
    eventAbi: eventAbis.gaugeCreated,
    onlyArgs: true,
    cacheInCloud: true,
  });

  const v2PoolToGauge = new Map<string, string>();
  const v2GaugeFactory = CONFIG.v2GaugeFactory.toLowerCase();

  for (const log of logs as any[]) {
    const gaugeFactory = String(log.gaugeFactory ?? log[2]).toLowerCase();
    const pool = String(log.pool ?? log[3]).toLowerCase();
    const gauge = String(log.gauge ?? log[6]).toLowerCase();
    if (gaugeFactory === v2GaugeFactory) v2PoolToGauge.set(pool, gauge);
  }

  return { v2PoolToGauge };
}

async function fetchV2(options: FetchOptions, fromBlock: number, toBlock: number, gaugeMetadata: GaugeMetadata) {
  const { api, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const rawPools = (
    (await getLogs({
      target: CONFIG.v2Factory,
      fromBlock: CONFIG.v2FactoryStartBlock,
      toBlock,
      eventAbi: eventAbis.v2PoolCreated,
      onlyArgs: true,
      cacheInCloud: true,
    })) as any[]
  ).map(normalizePoolLog);

  if (!rawPools.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = rawPools.map((pool) => pool.pool.toLowerCase());
  const fees = await api.multiCall({
    abi: abis.v2Fee,
    target: CONFIG.v2Factory,
    calls: rawPools.map((pool) => ({ params: [pool.pool, pool.stable] })),
  });

  const gaugedPools = rawPools
    .map((pool, index) => ({ pool, index, poolId: poolIds[index], gauge: gaugeMetadata.v2PoolToGauge.get(poolIds[index]) }))
    .filter((pool) => pool.gauge);

  const stakedBalances = gaugedPools.length
    ? await api.multiCall({
        abi: abis.balanceOf,
        calls: gaugedPools.map(({ pool, gauge }) => ({ target: pool.pool, params: [gauge] })),
      })
    : [];
  const totalSupplies = gaugedPools.length
    ? await api.multiCall({ abi: abis.totalSupply, calls: gaugedPools.map(({ pool }) => pool.pool) })
    : [];

  const stakedShareByPool = new Map<string, BigNumber>();
  gaugedPools.forEach(({ poolId }, index) => {
    const totalSupply = toBN(totalSupplies[index], `${poolId} totalSupply`);
    const stakedBalance = toBN(stakedBalances[index], `${poolId} staked balance`);
    let stakedShare = totalSupply.gt(0) ? stakedBalance.div(totalSupply) : new BigNumber(0);
    if (stakedShare.gt(1)) stakedShare = new BigNumber(1);
    stakedShareByPool.set(poolId, stakedShare);
  });

  const poolInfo: Record<string, { token0: string; token1: string; fee: BigNumber; stakedShare: BigNumber }> = {};
  rawPools.forEach((pool, index) => {
    const poolId = pool.pool.toLowerCase();
    poolInfo[poolId] = {
      token0: pool.token0,
      token1: pool.token1,
      fee: toBN(fees[index], `${poolId} v2 fee`).div(V2_FEE_DENOMINATOR),
      stakedShare: stakedShareByPool.get(poolId) ?? new BigNumber(0),
    };
  });

  const swapLogsByPool = await getLogs({
    targets: poolIds,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.v2Swap,
    flatten: false,
  });

  (swapLogsByPool as any[][]).forEach((logs, index) => {
    const pool = poolIds[index];
    const info = poolInfo[pool];
    if (!info) return;

    for (const log of logs) {
      const amount0 = absBN(log.amount0In).plus(absBN(log.amount0Out));
      const amount1 = absBN(log.amount1In).plus(absBN(log.amount1Out));
      addPricedAmount(chain, dailyVolume, info.token0, info.token1, amount0, amount1);

      const { token: feeToken, amount: feeAmount } = getPricedAmount(
        chain,
        info.token0,
        info.token1,
        amount0.times(info.fee),
        amount1.times(info.fee),
      );
      addAmount(dailyFees, feeToken, feeAmount, METRIC.SWAP_FEES);
      addAmount(dailyUserFees, feeToken, feeAmount, METRIC.SWAP_FEES);

      const holders = feeAmount.times(info.stakedShare);
      addAmount(dailyHoldersRevenue, feeToken, holders, METRIC.V2_VOTER_FEES);
      addAmount(dailySupplySideRevenue, feeToken, feeAmount.minus(holders), METRIC.V2_LP_FEES);
    }
  });

  return { dailyVolume, dailyFees, dailyUserFees, dailyHoldersRevenue, dailySupplySideRevenue };
}

async function fetchCL(options: FetchOptions, fromBlock: number, toBlock: number) {
  const { api, fromApi, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const rawPools = (
    (await getLogs({
      target: CONFIG.clFactory,
      fromBlock: CONFIG.clFactoryStartBlock,
      toBlock,
      eventAbi: eventAbis.clPoolCreated,
      entireLog: true,
      skipCacheRead: true,
    })) as any[]
  ).map(normalizePoolLog);

  if (!rawPools.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = rawPools.map((pool) => pool.pool.toLowerCase());
  const fees = await api.multiCall({ abi: abis.clFee, calls: poolIds });
  const gaugeFeesStart = await fromApi.multiCall({ abi: abis.gaugeFees, calls: poolIds, permitFailure: true });
  const gaugeFeesEnd = await api.multiCall({ abi: abis.gaugeFees, calls: poolIds });

  const poolInfo: Record<string, { token0: string; token1: string; fee: BigNumber }> = {};
  rawPools.forEach((pool, index) => {
    poolInfo[pool.pool.toLowerCase()] = {
      token0: pool.token0,
      token1: pool.token1,
      fee: toBN(fees[index], `${pool.pool} CL fee`).div(CL_FEE_DENOMINATOR),
    };
  });

  const swapLogsByPool = await getLogs({
    targets: poolIds,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.clSwap,
    flatten: false,
  });

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

  const collectLogsByPool = await getLogs({
    targets: poolIds,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.collectFees,
    flatten: false,
  });

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
    addAmount(dailyHoldersRevenue, totals.pricedToken, holders, METRIC.CL_VOTER_FEES);
    addAmount(dailySupplySideRevenue, totals.pricedToken, totals.pricedFee.minus(holders), METRIC.CL_LP_FEES);
  });

  return { dailyVolume, dailyFees, dailyUserFees, dailyHoldersRevenue, dailySupplySideRevenue };
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const gaugeMetadata = await getGaugeMetadata(options, toBlock);
  const v2 = await fetchV2(options, fromBlock, toBlock, gaugeMetadata);
  const cl = await fetchCL(options, fromBlock, toBlock);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.add(v2.dailyVolume);
  dailyVolume.add(cl.dailyVolume);
  dailyFees.add(v2.dailyFees);
  dailyFees.add(cl.dailyFees);
  dailyUserFees.add(v2.dailyUserFees);
  dailyUserFees.add(cl.dailyUserFees);
  dailyHoldersRevenue.add(v2.dailyHoldersRevenue);
  dailyHoldersRevenue.add(cl.dailyHoldersRevenue);
  dailySupplySideRevenue.add(v2.dailySupplySideRevenue);
  dailySupplySideRevenue.add(cl.dailySupplySideRevenue);
  dailyRevenue.add(dailyHoldersRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Swap volume from UP v2 pools and UP concentrated liquidity pools on Robinhood Chain. Each swap is counted once on the pricing side of the pair to avoid double-counting both legs.",
  Fees: "Total swap fees paid by traders, valued on the same pricing side used for volume. V2 fees use PoolFactory.getFee(pool, stable), where 30 means 0.30%. Concentrated liquidity fees use CLPool.fee(), where 3000 means 0.30%.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "Fees routed to veUP voters through pool gauges, equal to HoldersRevenue.",
  HoldersRevenue: "For v2 pools, the staked-gauge LP share is estimated from pool.balanceOf(gauge) / pool.totalSupply. For concentrated liquidity pools, voter fee share is measured from CLPool.gaugeFees() deltas plus CollectFees events and applied to the priced fee total.",
  SupplySideRevenue: "Liquidity provider fees not routed to veUP voters.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All swap fees paid by traders on UP v2 and concentrated liquidity pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.V2_VOTER_FEES]: "V2 pool swap fees attributable to LP tokens staked in gauges and routed to veUP voters.",
    [METRIC.CL_VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veUP voters.",
  },
  HoldersRevenue: {
    [METRIC.V2_VOTER_FEES]: "V2 pool swap fees attributable to LP tokens staked in gauges and routed to veUP voters.",
    [METRIC.CL_VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veUP voters.",
  },
  SupplySideRevenue: {
    [METRIC.V2_LP_FEES]: "V2 pool swap fees retained by unstaked liquidity providers.",
    [METRIC.CL_LP_FEES]: "Concentrated liquidity swap fees retained by liquidity providers after gauge-routed fees.",
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
