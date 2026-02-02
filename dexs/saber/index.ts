import { CHAIN } from '../../helpers/chains';
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { queryAllium } from '../../helpers/allium'

async function fetch(_t: any, _a: any, options: FetchOptions) {
  const query = `
    select
      sum(usd_amount) as volume 
    from solana.dex.trades 
    where project='saber'
      and block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      and block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `
  const data = await queryAllium(query)
  const dailyVolume = data[0].volume

  return { dailyVolume }
}

const adapter : SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2021-05-28",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true
}

export default adapter
