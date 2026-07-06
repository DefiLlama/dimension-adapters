import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import request, { gql } from 'graphql-request'

const endpoint = 'https://api.torch.finance/graphql'

const query = gql`
  query {
    pools {
      metrics {
        volume24h
      }
    }
  }
`

interface IPool {
  metrics: { volume24h: string } | null
}

const fetch = async () => {
  const { pools }: { pools: IPool[] } = await request(endpoint, query)
  const dailyVolume = pools.reduce(
    (sum, pool) => sum + Number(pool.metrics?.volume24h ?? 0),
    0,
  )

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TON]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-09-02',
    },
  },
}

export default adapter
