import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import request, { gql } from 'graphql-request'

const endpoint = 'https://api.torch.finance/graphql'

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

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { pools }: { pools: IPool[] } = await request(endpoint, query)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const pool of pools) {
    const fee = Number(pool.metrics?.fee24h ?? 0)
    // adminFeeNumerator is the protocol's share of the fee, scaled by 1e10; the rest goes to LPs
    const protocolShare = fee * Number(pool.adminFeeNumerator) / 1e10
    dailyFees.addUSDValue(fee, 'Swap Fees')
    dailyRevenue.addUSDValue(protocolShare, 'Swap Fees To Treasury')
    dailySupplySideRevenue.addUSDValue(fee - protocolShare, 'Swap Fees To LPs')
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Swap fees paid by users on each swap, at each pool's own fee rate.",
  UserFees: 'Swap fees paid by users.',
  Revenue: "Protocol keeps the admin-fee share of swap fees (each pool's adminFeeNumerator).",
  ProtocolRevenue: "Protocol keeps the admin-fee share of swap fees (each pool's adminFeeNumerator).",
  SupplySideRevenue: 'The remaining swap fees are paid to liquidity providers.',
}

const breakdownMethodology = {
  Fees: { 'Swap Fees': 'Swap fees charged across all Torch pools.' },
  UserFees: { 'Swap Fees': 'Swap fees paid by users across all Torch pools.' },
  Revenue: { 'Swap Fees To Treasury': 'Admin-fee share of swap fees kept by the protocol.' },
  ProtocolRevenue: { 'Swap Fees To Treasury': 'Admin-fee share of swap fees kept by the protocol.' },
  SupplySideRevenue: { 'Swap Fees To LPs': 'Swap fees distributed to liquidity providers.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  // The Torch API only exposes current 24h rolling metrics (no hourly/historical query),
  // so data is pulled once at the current time rather than hourly.
  pullHourly: false,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-11-14',
    },
  },
}

export default adapter
