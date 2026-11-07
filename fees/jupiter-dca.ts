import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"
import { JUPITER_METRICS, jupTreasuryShare } from "./jupiter";
import { getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../helpers/jupiter-stats";

const LEGACY_DCA_FEE_WALLET = 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'
const fetchOnchain = async (options: FetchOptions) => {
  const legacyFees = await getSolanaReceived({ options, targets: [LEGACY_DCA_FEE_WALLET] })
  const dailyFees = options.createBalances();
  dailyFees.add(legacyFees, JUPITER_METRICS.JupDCAFees);
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees.clone(jupTreasuryShare(options.startOfDay)),
  }
}

// From 2026-01-01, Jupiter's stats API: DCA v1 fees in the legacy wallet above, and DCA v2 fees from orders settled as
// swaps signed by the keeper gasBidSWW5zmwXs3gn8TG2ijzKkrwpyM7ucwjgDQst6. Limit order fees are on the Jupiter Limit listing.
const fetchStatsApi = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, { dca: JUPITER_METRICS.JupDCAFees })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(jupTreasuryShare(options.startOfDay)) }
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
    Fees: 'Fees paid by users on DCA (recurring) orders.',
    Revenue: 'All DCA fees, kept by Jupiter.',
    ProtocolRevenue: "Half of DCA fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupDCAFees]: 'Fees paid by users on DCA orders.',
    },
    Revenue: {
      [JUPITER_METRICS.JupDCAFees]: 'All DCA fees, kept by Jupiter.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupDCAFees]: 'Half of DCA fees, kept by the treasury.',
    },
  }
}

export default adapter
