import request from "graphql-request";
import type { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";
import { addOneToken } from "../helpers/prices";

const subgraphUrl = "https://api.goldsky.com/api/public/project_cm33d1338c1jc010e715n1z6n/subgraphs/stable-swap-factory-ng-contracts-subgraph-flow-mainnet/2.2.0/gn"

const fetch = async (
  { createBalances, chain, getLogs, }: FetchOptions
): Promise<FetchResult> => {
  const {pools, tokenMap} = await getConfig('kittpunch/stable-' + chain, '', {
    fetcher: async () => {
      const query = `{  pools {
    address
    tokens {
      id
      token {
        id
      }
    }
  }}`
      const res = await request(subgraphUrl, query);
      const tokenMap: {[id: string]: string} = {}
      res.pools.forEach((pool: { tokens: { id: string, token: { id: string } }[] }) => {
        pool.tokens.forEach((token) => {
          tokenMap[token.id] = token.token.id
        })
      })
      const pools = res.pools.map((pool: { address: string }) => pool.address)
      return {pools, tokenMap}
    }
  })

  const logs = await getLogs({
    targets: pools,
    eventAbi: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
    flatten: false,
  })

  const dailyVolume = createBalances()
  logs.forEach((_logs, idx) => {
    const pool = pools[idx]
    _logs.forEach((log: any) => {
      const token0 = tokenMap[pool+'-'+log.sold_id]
      const token1 = tokenMap[pool+'-'+log.bought_id]
      addOneToken({ chain, balances: dailyVolume, token0, amount0: log.tokens_sold, token1, amount1: log.tokens_bought })
    })
  })
  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
