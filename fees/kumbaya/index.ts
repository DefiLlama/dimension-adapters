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
import { getUniV3LogAdapter } from "../../helpers/uniswap";

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

  if (isCloseToCurrentTime) {
    let dailyFees = pools.reduce((acc:any, i: any) => acc + +i.fees24hUSD, 0)
    let dailyVolume = pools.reduce((acc:any, i: any) => acc + +i.volume24hUSD, 0)
    return {
      dailyFees,
      dailyVolume,
      dailySupplySideRevenue: dailyFees,
      dailyRevenue: 0, // protocol fees are 0 until they enable it
      dailyProtocolRevenue: 0,
    }
  }

  return getUniV3LogAdapter({ pools: pools.map((i: any) => i.address), revenueRatio:0, })(options)
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: '2025-12-21',
};

export default adapter;
