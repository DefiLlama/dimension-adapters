import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import request, { gql } from 'graphql-request'

const endpoint = 'https://api.torch.finance/graphql'

const query = gql`
  query {
    pools {
      address
      adminFeeNumerator
      metrics {
        fee24h
      }
    }
  }
`

interface IPool {
  address: string
  adminFeeNumerator: string
  metrics: { fee24h: string } | null
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { pools }: { pools: IPool[] } = await request(endpoint, query)
  if (!pools?.length) throw new Error('Torch: GraphQL API returned no pools')

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const pool of pools) {
    const fee = Number(pool.metrics?.fee24h)
    if (!Number.isFinite(fee)) throw new Error(`Torch: missing/non-finite fee24h for pool ${pool.address}`)

    // adminFeeNumerator is the protocol's share of the fee, scaled by 1e10 (must be within [0, 1e10])
    const adminFeeNumerator = Number(pool.adminFeeNumerator)
    if (!Number.isFinite(adminFeeNumerator) || adminFeeNumerator < 0 || adminFeeNumerator > 1e10)
      throw new Error(`Torch: adminFeeNumerator out of [0, 1e10] for pool ${pool.address}: ${pool.adminFeeNumerator}`)

    const protocolShare = fee * adminFeeNumerator / 1e10
    dailyFees.addUSDValue(fee, 'Swap Fees')
    dailyRevenue.addUSDValue(protocolShare, 'Swap Fees To Treasury')
    dailySupplySideRevenue.addUSDValue(fee - protocolShare, 'Swap Fees To LPs')
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Swap fees paid by users on each swap, at each pool's own fee rate.",
  Revenue: "Protocol keeps the admin-fee share of swap fees (each pool's adminFeeNumerator).",
  ProtocolRevenue: "Protocol keeps the admin-fee share of swap fees (each pool's adminFeeNumerator).",
  SupplySideRevenue: 'The remaining swap fees are paid to liquidity providers.',
}

const breakdownMethodology = {
  Fees: { 'Swap Fees': 'Swap fees charged across all Torch pools.' },
  Revenue: { 'Swap Fees To Treasury': 'Admin-fee share of swap fees kept by the protocol.' },
  ProtocolRevenue: { 'Swap Fees To Treasury': 'Admin-fee share of swap fees kept by the protocol.' },
  SupplySideRevenue: { 'Swap Fees To LPs': 'Swap fees distributed to liquidity providers.' },
}

const adapter: SimpleAdapter = {
  // v1: the Torch API only exposes a current 24h rolling aggregate (no hourly/historical query).
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  runAtCurrTime: true,
  start: '2023-11-14',
  methodology,
  breakdownMethodology,
}

export default adapter
