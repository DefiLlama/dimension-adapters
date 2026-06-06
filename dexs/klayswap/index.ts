import { cache } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";


async function fetch({ createBalances, getLogs, api, }: FetchOptions) {
  const factory = '0xc6a2ad8cc6e4a7e08fc37cc5954be07d499e7654'
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-klaytn.json`
  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  const pairObject: any = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize: 32 })
  const dailyVolume = createBalances()
  const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: 'event ExchangePos(address tokenA, uint amountA, address tokenB, uint amountB)' })
  allLogs.map((log: any) => {
    addOneToken({ balances: dailyVolume, token0: log.tokenA, token1: log.tokenB, amount0: log.amountA, amount1: log.amountB, chain: api.chain, })
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.KLAYTN],
};

export default adapter;
