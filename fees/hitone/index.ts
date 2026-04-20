/**
 * Hit One perpetual futures fees adapter.
 *
 * Reports:
 *   - dailyFees:   gross fees paid by users (1% on open + 5% of realized profit on close)
 *   - dailyRevenue: equal to dailyFees — Hit One has no supply-side party (no LPs,
 *                   stakers, integrators, or external referral beneficiaries that siphon
 *                   before the protocol), so 100% of gross fees accrue to the protocol.
 *
 * Per-trade data is not emitted on-chain — Hit One aggregates positions at the
 * WCM venue layer. The adapter hits our public stats endpoint for each hour
 * DefiLlama polls.
 *
 * Volume is reported via the sibling adapter at dexs/hitone/index.ts.
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

const fetch = async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
  const url = `${STATS_URL}?start=${startTimestamp}&end=${endTimestamp}`
  const data: HitOneStats = await fetchURL(url)

  if (data?.feesUsd == null) {
    throw new Error(`Hit One stats response missing feesUsd: ${JSON.stringify(data)}`)
  }

  const feesUsd = Number(data.feesUsd)
  const dailyFees = createBalances()
  dailyFees.addUSDValue(feesUsd, 'Perp Trading Fees')

  // Revenue equals Fees: no supply-side party takes a cut before the protocol.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: 1776096000, // 2026-04-13 12:00 ET (16:00 UTC) — Hit One public launch
  methodology: {
    Fees:
      "Gross fees paid by users: 1% of collateral on position open + 5% of realized profit on profitable closes.",
    Revenue:
      "All user-paid fees accrue to the Hit One protocol — there is no supply-side party (LPs, stakers, integrators, external referral beneficiaries) that takes a share before the protocol. Revenue equals Fees.",
  },
  breakdownMethodology: {
    Fees: {
      'Perp Trading Fees':
        '1% of collateral on position open + 5% of realized profit on profitable close.',
    },
    Revenue: {
      'Perp Trading Fees': '100% of user-paid trading fees retained by the protocol.',
    },
  },
}

export default adapter
