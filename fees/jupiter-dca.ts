import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"
import { JUPITER_METRICS } from "./jupiter";
import { getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../helpers/jupiter-stats";

const LEGACY_DCA_FEE_WALLET = 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'

const fetchOnchain = async (options: FetchOptions) => {
  const legacyFees = await getSolanaReceived({ options, targets: [LEGACY_DCA_FEE_WALLET] })
  const dailyFees = options.createBalances();
  dailyFees.add(legacyFees, JUPITER_METRICS.JupDCAFees);
  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1),
    dailyProtocolRevenue: dailyFees.clone(1),
  }
}

// From 2026-01-01, Jupiter's stats API: DCA v1 fees in the legacy wallet above, and DCA v2 fees from orders settled as
// swaps signed by the keeper gasBidSWW5zmwXs3gn8TG2ijzKkrwpyM7ucwjgDQst6. Limit order fees are on the Jupiter Limit listing.
const fetchStatsApi = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, { dca: JUPITER_METRICS.JupDCAFees })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1) }
}

const fetchFeesSolana = async (options: FetchOptions) =>
  options.startOfDay >= JUPITER_STATS_API_START_TS ? fetchStatsApi(options) : fetchOnchain(options)

const adapter: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFeesSolana,
      start: '2024-01-01',
    },
  },
  methodology: {
    Fees: 'Fees on DCA orders. Before 2026-01-01, fees received by the DCA fee wallet. From 2026-01-01, DCA v1 and v2 fees from Jupiter\'s stats API.',
    Revenue: 'All DCA fees, kept by Jupiter.',
    ProtocolRevenue: 'All revenue goes to the Jupiter treasury.',
    HoldersRevenue: 'JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupDCAFees]: 'Fees on DCA orders: received by the DCA fee wallet before 2026-01-01, DCA v1 and v2 from 2026-01-01.',
    },
    Revenue: {
      [JUPITER_METRICS.JupDCAFees]: 'All DCA fees, kept by Jupiter.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupDCAFees]: 'All DCA fees, to the Jupiter treasury.',
    },
  }
}

export default adapter
