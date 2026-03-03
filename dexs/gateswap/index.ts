import { cache } from '@defillama/sdk'
import { FetchV2, IJSON, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addOneToken } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'

const FACTORY_ADDRESS = '0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2'
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const fetch: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, api, chain } = fetchOptions
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${FACTORY_ADDRESS.toLowerCase()}-${chain}.json`
  const { pairs = [], token0s = [], token1s = [] } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs.length) throw new Error('No pairs found for GateSwap')

  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pairIds = Object.keys(filteredPairs)
  const dailyVolume = createBalances()

  for (const pair of pairIds) {
    const [token0, token1] = pairObject[pair] || []
    if (!token0 || !token1) continue

    // Fetch each pool sequentially to keep RPC concurrency at 1
    const swapLogs = await getLogs({ target: pair, eventAbi: SWAP_EVENT })
    if (!swapLogs?.length) continue

    swapLogs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
    })
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: 'Total swap volume collected from factory 0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2',
  },
  start: '2025-09-27',
  chains: [CHAIN.GATE_LAYER],
  fetch,
}

export default adapter