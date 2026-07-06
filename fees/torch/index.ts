import { FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import request, { gql } from 'graphql-request'

const endpoint = 'https://api.torch.finance/graphql'

// Each pool sets its own fee (feeNumerator) and the protocol's share of that fee
// (adminFeeNumerator), both scaled by 1e10. The rest of the fee goes to LPs.
const FEE_DENOMINATOR = 1e10

const query = gql`
  query {
    pools {
      adminFeeNumerator
      metrics {
        fee24h
      }
    }
  }
`

interface IPool {
  adminFeeNumerator: string
  metrics: { fee24h: string } | null
}

const fetchFees = async (): Promise<FetchResultV2> => {
  const { pools }: { pools: IPool[] } = await request(endpoint, query)

  let dailyFees = 0
  let dailyProtocolRevenue = 0
  for (const pool of pools) {
    const fee = Number(pool.metrics?.fee24h ?? 0)
    dailyFees += fee
    dailyProtocolRevenue += fee * Number(pool.adminFeeNumerator) / FEE_DENOMINATOR
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: dailyFees - dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'Swap fees paid by users, at each pool\'s own fee rate.',
  UserFees: 'Users pay a swap fee set per pool.',
  Revenue: 'Protocol keeps the admin-fee share of swap fees (set per pool).',
  ProtocolRevenue: 'Protocol keeps the admin-fee share of swap fees (set per pool).',
  SupplySideRevenue: 'Remaining swap fees are paid to liquidity providers.',
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.TON]: {
      fetch: fetchFees,
      runAtCurrTime: true,
      start: '2023-11-14',
    },
  },
}

export default adapter
