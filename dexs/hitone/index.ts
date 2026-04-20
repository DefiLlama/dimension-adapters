/**
 * Hit One perpetual futures volume adapter.
 *
 * Reports:
 *   - dailyVolume: total notional of perpetual trade events (open, close, add, reduce)
 *
 * Per-trade data is not emitted on-chain — Hit One aggregates positions at the
 * WCM venue layer. The adapter hits our public stats endpoint for each hour
 * DefiLlama polls.
 *
 * Fees are reported via the sibling adapter at fees/hitone/index.ts.
 */
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const STATS_URL = "https://api.hit.one/api/public/stats/defillama"

interface HitOneStats {
  start: number
  end: number
  volumeUsd: string
  feesUsd: string
}

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const url = `${STATS_URL}?start=${startTimestamp}&end=${endTimestamp}`
  const data: HitOneStats = await fetchURL(url)

  if (data?.volumeUsd == null) {
    throw new Error(`Hit One stats response missing volumeUsd: ${JSON.stringify(data)}`)
  }

  return {
    dailyVolume: Number(data.volumeUsd),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: 1776096000, // 2026-04-13 12:00 ET (16:00 UTC) — Hit One public launch
  methodology: {
    Volume:
      "Sum of notional (size × price) across every trade event (open, close, add, reduce) executed on Hit One in the period. Round-trip counts as 2× notional, consistent with GMX/Hyperliquid convention.",
  },
}

export default adapter
