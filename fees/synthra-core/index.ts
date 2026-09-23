import { Adapter, FetchOptions } from '../../adapters/types'
import core, { breakdownMethodology, fetch as fetchCore, methodology } from '../../dexs/synthra-core'

// Same on-chain source as dexs/synthra-core; this listing publishes the fee and revenue metrics.
async function fetch(options: FetchOptions) {
  const { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue } = await fetchCore(options)
  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
}

const { Volume: _volume, ...feeMethodology } = methodology
const { Volume: _volumeBreakdown, ...feeBreakdownMethodology } = breakdownMethodology

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: (core as any).adapter,
  methodology: feeMethodology,
  breakdownMethodology: feeBreakdownMethodology,
}

export default adapter
