import { CHAIN } from '../../helpers/chains'
import { FetchV2, SimpleAdapter } from '../../adapters/types'
import fetchURL from '../../utils/fetchURL'

const METRICS_URL = 'https://ton4u.io/api/defillama/metrics'

type MetricsVariantDaily = {
	fees_usd?: number | string
}

type MetricsVariant = {
	daily?: MetricsVariantDaily
}

type MetricsPayload = {
	// `variants` is a per-settlement-asset breakdown (t4u/usdt/...) aggregated for the UTC day.
	// A single protocol-wide daily fees number is derived by summing all non-demo variants.
	variants?: Record<string, MetricsVariant>
}

function parseFiniteNumber(value: unknown) {
	const n = Number(value)
	return Number.isFinite(n) ? n : undefined
}

function computeDailyFeesUsd(payload: MetricsPayload) {
	const variants = payload?.variants ?? {}
	const entries = Object.entries(variants)
	if (entries.length === 0) return undefined

	let total = 0
	let any = false

	for (const [key, variant] of entries) {
		// Never include demo buckets even if present.
		if (String(key).toLowerCase() === 'demo') continue

		const feesUsd = parseFiniteNumber(variant?.daily?.fees_usd)
		if (feesUsd === undefined) continue
		if (feesUsd < 0) continue

		total += feesUsd
		any = true
	}

	// `0` is a valid daily value (no activity). If none of the variants expose a parseable value,
	// treat it as an invalid / incompatible payload rather than silently returning 0.
	return any ? total : undefined
}

const fetch: FetchV2 = async (options) => {
	// DefiLlama runs the adapter for a specific day window. Our backend endpoint expects a unix timestamp
	// and returns daily aggregates for the UTC day containing that timestamp.
	// Important: for V2 adapters, `startTimestamp` is derived from a `[from,to)` window and can be offset by -1s,
	// which may select the previous UTC day. `toTimestamp` (or `endTimestamp - 1`) reliably targets the intended day.
	//
	// The Ton4You metrics endpoint also supports an explicit `day=YYYY-MM-DD` selector, which is unambiguous and
	// matches the DefiLlama adapter runner's UTC day bucketing. We prefer it when available and fall back to timestamp.
	const dayTimestamp = Number(
		(options as any)?.startOfDay ??
			(options as any)?.toTimestamp ??
			(typeof (options as any)?.endTimestamp === 'number' ? (options as any).endTimestamp - 1 : undefined) ??
			(options as any)?.startTimestamp ??
			(options as any)?.timestamp,
	)
	if (!Number.isFinite(dayTimestamp)) throw new Error('Invalid adapter timestamp')

	let response: MetricsPayload | undefined
	const dayString = String((options as any)?.dateString ?? '').trim()
	if (dayString) {
		try {
			response = (await fetchURL(`${METRICS_URL}?day=${encodeURIComponent(dayString)}`)) as MetricsPayload
		} catch {
			response = undefined
		}
	}
	if (!response) {
		response = (await fetchURL(`${METRICS_URL}?timestamp=${dayTimestamp}`)) as MetricsPayload
	}
	const dailyFeesUsd = computeDailyFeesUsd(response)
	if (dailyFeesUsd === undefined) throw new Error('Invalid Ton4You metrics response')

	// Ton4You currently routes fees to service/referral NFTs (holders-like distribution),
	// so we report them as holders revenue too.
	return {
		dailyFees: dailyFeesUsd,
		dailyUserFees: dailyFeesUsd,
		dailyRevenue: dailyFeesUsd,
		dailyHoldersRevenue: dailyFeesUsd,
	}
}

const adapter: SimpleAdapter = {
	methodology: {
		Fees: (
			'Ton4You fees are defined as the protocol service fee plus the referral reward that is paid out when a position is settled. ' +
			'The protocol supports multiple settlement assets (jettons), so fees are tracked per settlement asset ("variant") and aggregated ' +
			'over a UTC day. This adapter fetches the daily breakdown and reports a single protocol-wide daily value by summing all live variants ' +
			'(excluding demo/test variants if present).'
		),
		DataSource: (
			'A public Ton4You metrics endpoint that serves daily aggregates derived from on-chain pool state and position settlement activity. ' +
			'The adapter selects the UTC day using DefiLlama\'s `dateString` (YYYY-MM-DD) when available, and falls back to a unix timestamp. ' +
			'The response corresponds to a single UTC day bucket.'
		),
		RevenueMapping: (
			'The adapter reports dailyFees, dailyUserFees, dailyRevenue, and dailyHoldersRevenue as the same USD value. ' +
			'This reflects that fees are paid by users on settlement and are distributed to protocol stakeholders (service/referral NFT holders).'
		),
	},
	version: 2,
	adapter: {
		[CHAIN.TON]: {
			start: '2026-01-01',
			fetch,
		},
	},
}

export default adapter
