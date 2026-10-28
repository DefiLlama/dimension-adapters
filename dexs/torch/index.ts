import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import request, { gql } from 'graphql-request'

const endpoint = 'https://api.torch.finance/graphql'

const query = gql`
  query {
    pools {
      address
      metrics {
        volume24h
      }
    }
  }
`

interface IPool {
  address: string
  metrics: { volume24h: string } | null
}

const fetch = async (options: FetchOptions) => {
  const { pools }: { pools: IPool[] } = await request(endpoint, query)
  if (!pools?.length) throw new Error('Torch: GraphQL API returned no pools')

  const dailyVolume = options.createBalances()
  for (const pool of pools) {
    const volume = Number(pool.metrics?.volume24h)
    if (!Number.isFinite(volume)) throw new Error(`Torch: missing/non-finite volume24h for pool ${pool.address}`)
    dailyVolume.addUSDValue(volume)
  }

  return { dailyVolume }
}

const methodology = {
  Volume: 'Trading volume across all Torch stableswap pools on TON.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  runAtCurrTime: true,
  start: '2024-09-02',
  methodology,
}

export default adapter
