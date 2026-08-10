/**
 * Kumbaya DEX - Uniswap V3 fork on MegaETH
 * https://kumbaya.xyz
 *
 * Data source: Envio indexer (https://kby-hasura.up.railway.app/v1/graphql)
 * Fee structure: 50% protocol / 50% LPs (when protocol fees enabled)
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk"
import { addOneToken } from "../../helpers/prices";

const SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"

const FEE_REDUCTION_DATE = "2026-05-01"
const BPS = 10000
const PERCENTAGE_DIVIDER = 100
const FEE_TIER_DIVIDER = BPS * PERCENTAGE_DIVIDER

function getRevenueShare(feeTier: number, options: FetchOptions): number {
  if (options.dateString < FEE_REDUCTION_DATE) return 0.5;
  if (feeTier === 100) return 0.25;
  if (feeTier === 500) return 0.25;
  if (feeTier === 3000) return 0.1667;
  if (feeTier === 10000) return 0.1667;
  throw new Error(`Invalid fee tier ${feeTier}`)
}

const fetch = async (options: FetchOptions) => {
  let { pools } = await sdk.cache.cachedFetch({
    endpoint: 'https://exchange.kumbaya.xyz/api/v1/pools/metrics?chainId=4326&limit=500&sortBy=fees24h&sortOrder=desc&minTvlETH=1',
    key: `kumbaya/pools-${options.chain}`,
    writeCacheOptions: {
      skipR2CacheWrite: false, // save in cloud
    }
  })
  pools = pools.filter((i: any) => +i.totalValueLockedUSD > 5000)
  
  const timeNow = Math.floor(Date.now() / 1000)
  const isCloseToCurrentTime = Math.abs(timeNow - options.toTimestamp) < 3600 * 6 // 6 hour

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (isCloseToCurrentTime) {
    for (const pool of pools) {
      const { feeTier, fees24hUSD, volume24hUSD } = pool;
      const revenueShare = getRevenueShare(feeTier, options);
      dailyFees.addUSDValue(Number(fees24hUSD));
      dailyVolume.addUSDValue(Number(volume24hUSD));
      dailyRevenue.addUSDValue(Number(fees24hUSD) * revenueShare);
    }

    const dailySupplySideRevenue = dailyFees.clone();
    dailySupplySideRevenue.subtract(dailyRevenue);

    return {
      dailyFees,
      dailyVolume,
      dailySupplySideRevenue,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
    }
  }

  const poolList = pools.map((i: any) => i.address);
  const feeTiers = pools.map((i: any) => i.feeTier);
  const token0s = pools.map((i: any) => i.token0.address);
  const token1s = pools.map((i: any) => i.token1.address);

  const swapLogs = await options.getLogs({
    targets: poolList,
    eventAbi: SWAP_EVENT,
    flatten: false,
  })

  swapLogs.map((logs: any, index) => {
    const token0 = token0s[index]
    const token1 = token1s[index]
    const feeTier = feeTiers[index]
    const revenueShare = getRevenueShare(feeTier, options)
    const fee = feeTier / FEE_TIER_DIVIDER

    if (!logs.length || !token0 || !token1) return;

    logs.forEach((log: any) => {
      addOneToken({ balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      addOneToken({ balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * fee * revenueShare, amount1: log.amount1.toString() * fee * revenueShare })
    })
  })

  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.subtract(dailyRevenue);

  return {
    dailyFees,
    dailyVolume,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: '2025-12-21',
};

export default adapter;
