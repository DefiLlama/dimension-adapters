import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { YOLO_START } from '../helpers/jupiter-yolo'
import { getJupiterStatsRevenue } from '../helpers/jupiter-stats'

const LABELS = {
  profitFees: 'Profit Fees',
  profitFeesToJupiter: 'Profit Fees To Jupiter',
}

// Jupiter's stats API. Profit fees are taken from winning payouts by the YOLO program
// yoLovHV5eT4DNPMG2Bu1NLmq8nVygEAPrNT1Rx6vWFA and held in its fee balance, separate from the house bankroll.
// Onchain method: sum the fees in the program's AccrueFee ledger events, in JupUSD: win fees (YOLO_KIND.winFee in
// helpers/jupiter-yolo.ts) and any close fees.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, {
    yolo: { fees: LABELS.profitFees, revenue: LABELS.profitFeesToJupiter, supplySide: LABELS.profitFees },
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: YOLO_START,
  methodology: {
    Fees: 'Profit fee of 2% on the gain of every winning trade, taken from the payout, from Jupiter\'s stats API. Opening a position, losing trades and liquidations are free and there is no funding. The house bankroll\'s trading profit is not counted.',
    Revenue: 'All profit fees, kept by Jupiter in a fee balance of the YOLO program separate from the house bankroll; there are no liquidity providers.',
    ProtocolRevenue: 'All profit fees, kept by Jupiter.',
    HoldersRevenue: 'JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.profitFees]: '2% of the gain on each winning trade, deducted from the payout the trader receives.',
    },
    Revenue: {
      [LABELS.profitFeesToJupiter]: 'All profit fees, kept by Jupiter.',
    },
    ProtocolRevenue: {
      [LABELS.profitFeesToJupiter]: 'All profit fees, kept by Jupiter.',
    },
  },
}

export default adapter
