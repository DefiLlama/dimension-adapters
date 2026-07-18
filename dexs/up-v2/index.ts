import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { isCoreAsset } from "../../helpers/prices";

// UP public launch on Robinhood Chain. Source: first public UP pool deployments on the Robinhood Chain explorer.
const START = "2026-07-10";

// Public UP v2 deployment addresses and first event blocks on Robinhood Chain.
// Source: Robinhood Chain explorer contract/event history for the voter and v2 factory.
const CONFIG = {
  voter: "0x7F749fDD351C1Ceed82d76d7699CB631Eb8332a7",
  v2Factory: "0xFA5429AEBa338BEa2BFcc1b9a889862Ee395bc28",
  v2GaugeFactory: "0x6df2E93cc56E96330dce2B60e34D88AF3EF23580",
  v2FactoryStartBlock: 6180950,
  voterStartBlock: 6181013,
};

// V2 PoolFactory.getFee returns basis points.
const V2_FEE_DENOMINATOR = 10_000;

const eventAbis = {
  poolCreated: "event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)",
  swap:
    "event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)",
  gaugeCreated:
    "event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)",
};

const abis = {
  fee: "function getFee(address pool, bool stable) view returns (uint256)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
  totalSupply: "erc20:totalSupply",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  VOTER_FEES: "V2 Gauge Voter Fees",
  LP_FEES: "V2 Liquidity Provider Fees",
};

type PoolLog = {
  token0: string;
  token1: string;
  pool: string;
  stable?: boolean;
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();

function normalizePoolLog(log: any): PoolLog {
  const args = log.args ?? log;
  return {
    token0: args.token0,
    token1: args.token1,
    pool: args.pool,
    stable: args.stable,
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

async function getV2PoolToGauge(options: FetchOptions, toBlock: number): Promise<Map<string, string>> {
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

  return v2PoolToGauge;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const v2PoolToGauge = await getV2PoolToGauge(options, toBlock);

  const rawPools = (
    (await getLogs({
      target: CONFIG.v2Factory,
      fromBlock: CONFIG.v2FactoryStartBlock,
      toBlock,
      eventAbi: eventAbis.poolCreated,
      onlyArgs: true,
      cacheInCloud: true,
    })) as any[]
  ).map(normalizePoolLog);

  if (!rawPools.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = rawPools.map((pool) => pool.pool.toLowerCase());
  const fees = await api.multiCall({
    abi: abis.fee,
    target: CONFIG.v2Factory,
    calls: rawPools.map((pool) => ({ params: [pool.pool, pool.stable] })),
  });

  const gaugedPools = rawPools
    .map((pool, index) => ({ pool, poolId: poolIds[index], gauge: v2PoolToGauge.get(poolIds[index]) }))
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
    eventAbi: eventAbis.swap,
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
      addAmount(dailyHoldersRevenue, feeToken, holders, METRIC.VOTER_FEES);
      addAmount(dailySupplySideRevenue, feeToken, feeAmount.minus(holders), METRIC.LP_FEES);
    }
  });

  dailyRevenue.add(dailyHoldersRevenue);

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume from UP v2 pools on Robinhood Chain. Each swap is counted once on the pricing side of the pair.",
  Fees: "Total v2 swap fees paid by traders, valued on the same pricing side used for volume. Fees use PoolFactory.getFee(pool, stable), where 30 means 0.30%.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "V2 swap fees routed to veUP voters through gauges, equal to HoldersRevenue.",
  HoldersRevenue: "V2 pool fees attributable to staked gauge LP share, estimated from pool.balanceOf(gauge) / pool.totalSupply.",
  SupplySideRevenue: "V2 liquidity provider fees not routed to veUP voters.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All v2 swap fees paid by traders.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All v2 swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.VOTER_FEES]: "V2 pool swap fees attributable to LP tokens staked in gauges and routed to veUP voters.",
  },
  HoldersRevenue: {
    [METRIC.VOTER_FEES]: "V2 pool swap fees attributable to LP tokens staked in gauges and routed to veUP voters.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "V2 pool swap fees retained by unstaked liquidity providers.",
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
