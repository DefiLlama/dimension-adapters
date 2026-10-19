import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'
import { JUPUSD, YOLO_KIND, YOLO_START, assertYoloGuards, yoloEventsCte, yoloGuardsCte } from '../helpers/jupiter-yolo'

const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options
  const [row] = await queryAllium(`
    WITH ${yoloEventsCte(start, end)}, ${yoloGuardsCte(start, end)}
    SELECT g.unknown_events, g.ingested, l.notional, l.margin, l.paid_out
    FROM yolo_guards g
    LEFT JOIN (
      SELECT
        TO_VARCHAR(COALESCE(SUM(notional), 0)::NUMBER(38, 0)) AS notional,
        TO_VARCHAR(COALESCE(SUM(margin), 0)::NUMBER(38, 0)) AS margin,
        COUNT_IF(amount > 0 OR queued > 0) AS paid_out
      FROM yolo_events
      WHERE kind = '${YOLO_KIND.liquidation}'
    ) l ON TRUE
  `)
  assertYoloGuards(row, end)
  if (Number(row.paid_out) > 0) throw new Error(`jupiter-yolo: ${row.paid_out} liquidations paid out part of the margin`)

  const dailyLiquidationVolume = options.createBalances()
  const dailyCollateralLiquidated = options.createBalances()
  dailyLiquidationVolume.add(JUPUSD, row.notional)
  dailyCollateralLiquidated.add(JUPUSD, row.margin)
  return {
    //dailyLiquidationVolume,
    dailyCollateralLiquidated,
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
    //LiquidationVolume: 'Notional (margin times leverage) of positions liquidated by the program. Positions closed by their owner are not counted: every close pays part of the margin back.',
    CollateralLiquidated: 'JupUSD margin of the liquidated positions: a liquidation pays the trader nothing, so the whole margin is lost.',
  },
}

export default adapter
