import { httpPost } from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import * as sdk from '@defillama/sdk'

interface PoolStats {
  volume: number;
  fees: number;
}

const POOL_STATS_CHUNK_SIZE = 42;

const fetchPoolStats = async (poolIds: string[]): Promise<PoolStats[]> => {
  try {
    const result = await httpPost('https://aftermath.finance/api/pools/stats', { poolIds })
    if (!Array.isArray(result)) throw new Error('Invalid Aftermath pool stats response')
    return result
  } catch (error) {
    if (poolIds.length === 1) throw error

    const midpoint = Math.ceil(poolIds.length / 2)
    const [left, right] = await Promise.all([
      fetchPoolStats(poolIds.slice(0, midpoint)),
      fetchPoolStats(poolIds.slice(midpoint)),
    ])
    return [...left, ...right]
  }
}

const fetch = async ({ createBalances }: FetchOptions): Promise<FetchResult> => {
  const pools = await httpPost('https://aftermath.finance/api/pools', {})
  const poolObjectIds = pools.map((pool: any) => pool.objectId)
  const chunks = sdk.util.sliceIntoChunks(poolObjectIds, POOL_STATS_CHUNK_SIZE)

  let volumeUsd = 0
  let feesUsd = 0

  for (const chunk of chunks) {
    const result = await fetchPoolStats(chunk)
    volumeUsd += result.reduce((acc: number, pool: PoolStats) => acc + pool.volume, 0)
    feesUsd += result.reduce((acc: number, pool: PoolStats) => acc + pool.fees, 0)
  }

  const dailyFees = createBalances();
  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);
  const dailyUserFees = dailyFees.clone(1, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = dailyFees.clone(1, METRIC.LP_FEES);
  const dailyVolume = createBalances();
  dailyVolume.addUSDValue(volumeUsd);

  return {
    dailyFees, dailyUserFees, dailySupplySideRevenue, dailyVolume
  };
};

const methodology = {
  Fees: "Swap fees collected from all AMM pools on Aftermath Finance",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue: "Swap fees earned by liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees charged on token swaps across all Aftermath Finance AMM pools"
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by traders on token swaps across all Aftermath Finance AMM pools"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Trading fees distributed to liquidity providers"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SUI],
  fetch,
  start: '2023-07-20',
  runAtCurrTime: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
