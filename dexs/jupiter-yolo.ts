import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'
import { assertYoloGuards, JUPUSD, YOLO_KIND, YOLO_START, yoloEventsCte, yoloGuardsCte } from '../helpers/jupiter-yolo'

const LABELS = {
  profitFees: 'Profit Fees',
  profitFeesToJupiter: 'Profit Fees To Jupiter',
}

// Half of Jupiter's revenue goes to the treasury, the other half buys back JUP (counted on the Jupiter Aggregator listing).
const TREASURY_SHARE = 0.5

// Kept onchain instead of Jupiter's stats API: the program's win fee events match the API to the dollar.
const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options
  const [row] = await queryAllium(`
    WITH ${yoloEventsCte(start, end)}, ${yoloGuardsCte(start, end)}
    SELECT g.unknown_events, g.ingested, t.volume, t.fees
    FROM yolo_guards g
    LEFT JOIN (
      SELECT
        TO_VARCHAR(COALESCE(SUM(CASE WHEN kind IN ('${YOLO_KIND.open}', '${YOLO_KIND.close}') THEN notional END), 0)::NUMBER(38, 0)) AS volume,
        TO_VARCHAR(COALESCE(SUM(CASE WHEN kind = '${YOLO_KIND.winFee}' THEN amount END), 0)::NUMBER(38, 0)) AS fees
      FROM yolo_events
    ) t ON TRUE
  `)
  assertYoloGuards(row, end)

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  dailyVolume.add(JUPUSD, row.volume)
  dailyFees.add(JUPUSD, row.fees, LABELS.profitFees)

  const dailyRevenue = dailyFees.clone(1, LABELS.profitFeesToJupiter)
  const dailyProtocolRevenue = dailyFees.clone(TREASURY_SHARE, LABELS.profitFeesToJupiter)

  return {
    //dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: YOLO_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    //Volume: 'Notional (margin times leverage) of every position opened and every position closed by its owner. Liquidations are not counted.',
    Fees: "2% fee on the profit of every winning trade, taken from the payout. Opening, losing trades and liquidations are free. The house bankroll's trading profit is not counted.",
    Revenue: 'All profit fees, kept by Jupiter. There are no liquidity providers.',
    ProtocolRevenue: 'Half of profit fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.profitFees]: '2% of the profit on each winning trade, deducted from the payout.',
    },
    Revenue: {
      [LABELS.profitFeesToJupiter]: 'All profit fees, kept by Jupiter.',
    },
    ProtocolRevenue: {
      [LABELS.profitFeesToJupiter]: 'Half of profit fees, kept by the treasury.',
    },
  },
}

export default adapter
