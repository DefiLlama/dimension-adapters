import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'

// Synthra routes swaps and bridges through Relay and LI.FI and charges an application /
// integrator fee on them. The Synthra API publishes one immutable aggregate per UTC day built
// from per-trade settlement evidence (see methodology); a day is served only once every
// completed trade of that day has conclusive fee evidence.
const SYNTHRA_STATS_API = 'https://api-mainnet.synthra.org/api/v1/trade/platform-fees'
const RELAY_APP_FEES = 'Relay app fees'
const LIFI_INTEGRATOR_FEES = 'LI.FI integrator fees'

type RouterFeeResponse = {
  success: boolean
  data?: {
    date: string
    dailyFeesUsd: number
    breakdown?: { relayAppFeesUsd: number; lifiIntegratorFeesUsd: number }
    incompleteRequests: number
  }
}

async function fetch(options: FetchOptions) {
  const response: RouterFeeResponse = await fetchURL(`${SYNTHRA_STATS_API}?date=${encodeURIComponent(options.dateString)}`)
  const data = response.data
  if (!response.success || !data || data.date !== options.dateString || !data.breakdown) {
    throw new Error(`Synthra router fee data is unavailable for ${options.dateString}`)
  }
  if (data.incompleteRequests > 0) {
    throw new Error(`Synthra router fee data for ${options.dateString} is not final: ${data.incompleteRequests} trade(s) still lack conclusive fee evidence`)
  }

  const { relayAppFeesUsd, lifiIntegratorFeesUsd } = data.breakdown
  const parts = [relayAppFeesUsd, lifiIntegratorFeesUsd, data.dailyFeesUsd]
  if (parts.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
    throw new Error(`Synthra router fee data for ${options.dateString} has invalid amounts`)
  }
  // The reported total must be exactly the sum of its providers (tolerance: float rounding).
  if (Math.abs(relayAppFeesUsd + lifiIntegratorFeesUsd - data.dailyFeesUsd) > 1e-6) {
    throw new Error(`Synthra router fee breakdown for ${options.dateString} does not add up to the reported total`)
  }

  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(relayAppFeesUsd, RELAY_APP_FEES)
  dailyFees.addUSDValue(lifiIntegratorFeesUsd, LIFI_INTEGRATOR_FEES)

  // Application / integrator fees are paid by users and kept entirely by Synthra.
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  // External API that serves exact daily aggregates only.
  version: 1,
  chains: [CHAIN.OFF_CHAIN],
  start: '2026-07-01',
  fetch,
  methodology: {
    Fees: 'Application fees paid on successful Synthra router trades: Relay paidAppFees and LI.FI integrator fees.',
    UserFees: 'Same as Fees: router application fees are paid by users.',
    Revenue: 'All router application fees are collected by Synthra.',
    ProtocolRevenue: 'Same as Revenue; the fees accrue to the Synthra fee recipient.',
  },
  breakdownMethodology: {
    Fees: {
      [RELAY_APP_FEES]: 'Exact paidAppFees reported by Relay for each successful request, deduplicated by requestId.',
      [LIFI_INTEGRATOR_FEES]: 'Integrator fee forwarded to Synthra in the FeesForwarded event of each successful LI.FI origin transaction.',
    },
    UserFees: {
      [RELAY_APP_FEES]: 'Exact paidAppFees reported by Relay for each successful request, deduplicated by requestId.',
      [LIFI_INTEGRATOR_FEES]: 'Integrator fee forwarded to Synthra in the FeesForwarded event of each successful LI.FI origin transaction.',
    },
    Revenue: {
      [RELAY_APP_FEES]: 'Relay application fees collected by Synthra.',
      [LIFI_INTEGRATOR_FEES]: 'LI.FI integrator fees collected by Synthra.',
    },
    ProtocolRevenue: {
      [RELAY_APP_FEES]: 'Relay application fees collected by the Synthra fee recipient.',
      [LIFI_INTEGRATOR_FEES]: 'LI.FI integrator fees collected by the Synthra fee recipient.',
    },
  },
}

export default adapter
