import { cache } from "@defillama/sdk";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";
import { filterPools, } from "../../helpers/uniswap";

const swapEvent = 'event ExchangePos (address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut)'

const fetch: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, chain, api } = fetchOptions
  const factory = '0x9f3044f7f9fc8bc9ed615d54845b4577b833282d'.toLowerCase()
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  const pairObject: any = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const dailyVolume = createBalances()
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize: 32 })
  const pairIds = Object.keys(filteredPairs)
  api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${factory} Chain: ${chain}`)
  const allLogs = await getLogs({ targets: pairIds, eventAbi: swapEvent, })
  allLogs.map((log: any) => {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  })

  return { dailyVolume, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    polygon: {
      fetch,
    },
  },
};

export default adapter;
