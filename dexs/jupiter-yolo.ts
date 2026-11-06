import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'
import { assertYoloGuards, JUPUSD, YOLO_KIND, YOLO_START, yoloEventsCte, yoloGuardsCte } from '../helpers/jupiter-yolo'
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from '../fees/jupiter'

const LABELS = {
  profitFees: 'Profit Fees',
  profitFeesToJupiter: 'Profit Fees To Jupiter',
}

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

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay)
  const dailyHoldersRevenue = dailyFees.clone(buybackRatio, JUPITER_METRICS.TokenBuyBack)
  const dailyProtocolRevenue = dailyFees.clone(1 - buybackRatio, LABELS.profitFeesToJupiter)
  const dailyRevenue = options.createBalances()
  dailyRevenue.addBalances(dailyHoldersRevenue)
  dailyRevenue.addBalances(dailyProtocolRevenue)

  return {
    //dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
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
    Fees: 'Profit fee of 2% on the gain of every winning trade, taken from the payout. Opening a position, losing trades and liquidations are free and there is no funding. The house bankroll\'s trading profit is not counted.',
    Revenue: 'All profit fees, kept by Jupiter in a fee balance of the YOLO program separate from the house bankroll; there are no liquidity providers.',
    ProtocolRevenue: 'Half of profit fees, kept by Jupiter.',
    HoldersRevenue: 'Half of profit fees, used to buy back JUP under Jupiter\'s policy of spending 50% of revenue on JUP buybacks.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.profitFees]: '2% of the gain on each winning trade, deducted from the payout the trader receives.',
    },
    Revenue: {
      [LABELS.profitFeesToJupiter]: 'Half of profit fees, kept by Jupiter.',
      [JUPITER_METRICS.TokenBuyBack]: 'Half of profit fees, used to buy back JUP.',
    },
    ProtocolRevenue: {
      [LABELS.profitFeesToJupiter]: 'Half of profit fees, kept by Jupiter.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'Half of profit fees, used to buy back JUP.',
    },
  },
}

export default adapter
