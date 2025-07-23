import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const { data: { allPools } } = await getConfig('ellipsis', 'https://api.ellipsis.finance/api/getPoolsCrypto')
  const tokenIndexMap: any = {}
  const pools: any = []
  allPools.forEach((p: any) => {
    const pool = p.address.toLowerCase()
    pools.push(pool);
    (p.underlying ?? p.tokens).forEach((t: any) => {
      const token = t.address ?? t.erc20address
      tokenIndexMap[pool + '-' + t.index] = token
    })
  })
  const tLogs = await getLogs({ targets: pools, flatten: false, eventAbi: 'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)' })
  const tLogs1 = await getLogs({ targets: pools, flatten: false, eventAbi: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)' })
  const dailyVolume = createBalances()

  function addLogs(logs, i) {
    const pool = pools[i]
    logs.forEach((log: any) => {
      const token1 = tokenIndexMap[pool.toLowerCase() + '-' + log.bought_id]
      dailyVolume.add(token1, log.tokens_bought)
    })
  }
  tLogs.forEach(addLogs)
  tLogs1.forEach(addLogs)
  return { dailyVolume }

}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    bsc: {
      fetch,
    }
  }
};
export default adapter;
