import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { httpGet } from '../utils/fetchURL'

// Folks Finance (Algorand) money market fees.
// Reads global state from each v2 pool app (keys `i`/`v`/`s`, packed uint64 arrays, 16 d.p. rates).
// grossInterest = (varDebt*varRate + stableDebt*stableRate) / year
// protocolRevenue = grossInterest * retentionRate  (per-pool, 10–30%)
// supplySideRevenue = grossInterest - protocolRevenue

const ALGOD = 'https://mainnet-api.algonode.cloud'
const ONE_16_DP = 10n ** 16n
const DAYS_PER_YEAR = 365n
const ALGO_DECIMALS = 1e6

// v2 pool app IDs + underlying ASA (0 = native ALGO). 
// Source: https://github.com/Folks-Finance/algorand-js-sdk/blob/main/src/lend/constants/mainnet-constants.ts
const POOLS: Array<{ appId: number; assetId: number }> = [
  { appId: 971368268, assetId: 0 }, // ALGO
  { appId: 971370097, assetId: 793124631 }, // gALGO
  { appId: 2611131944, assetId: 1134696561 }, // xALGO
  { appId: 3073474613, assetId: 2537013734 }, // tALGO
  { appId: 971372237, assetId: 31566704 }, // USDC
  { appId: 971372700, assetId: 312769 }, // USDt
  { appId: 1060585819, assetId: 684649988 }, // GARD
  { appId: 1247053569, assetId: 227855942 }, // EURS
  { appId: 3514794123, assetId: 3495558025 }, // WBTC_NTT
  { appId: 3514795114, assetId: 3495722210 }, // WETH_NTT
  { appId: 971373361, assetId: 386192725 }, // goBTC
  { appId: 971373611, assetId: 386195940 }, // goETH
  { appId: 1067289273, assetId: 1058926737 }, // WBTC
  { appId: 1067289481, assetId: 887406851 }, // WETH
  { appId: 1166977433, assetId: 893309613 }, // WAVAX
  { appId: 1166980669, assetId: 887648583 }, // WSOL
  { appId: 1216434571, assetId: 1200094857 }, // WLINK
  { appId: 1258515734, assetId: 246516580 }, // GOLD
  { appId: 1258524099, assetId: 246519683 }, // SILVER
  { appId: 1044267181, assetId: 287867876 }, // OPUL
  { appId: 1166982094, assetId: 1163259470 }, // WMPL
  { appId: 3184317016, assetId: 0 }, // ISOLATED_ALGO
  { appId: 3184324594, assetId: 31566704 }, // ISOLATED_USDC
  { appId: 3184325123, assetId: 2200000000 }, // ISOLATED_TINY
  { appId: 3343137163, assetId: 3203964481 }, // ISOLATED_FOLKS
]

const asciiKey = (b64: string) => Buffer.from(b64, 'base64').toString('latin1')

const parseUint64s = (b64: string): bigint[] => {
  const buf = Buffer.from(b64, 'base64')
  const out: bigint[] = []
  for (let i = 0; i + 8 <= buf.length; i += 8) out.push(buf.readBigUInt64BE(i))
  return out
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const apps = await Promise.all(
    POOLS.map((p) => httpGet(`${ALGOD}/v2/applications/${p.appId}`).catch(() => undefined)),
  )

  apps.forEach((app, idx) => {
    const state = app?.params?.['global-state']
    if (!state) return
    const get = (name: string) => {
      const entry = state.find((s: any) => asciiKey(s.key) === name)
      return entry ? parseUint64s(entry.value.bytes) : undefined
    }
    const i = get('i')
    const v = get('v')
    const s = get('s')
    if (!i || !v || !s) return

    const retentionRate = i[0]
    const variableDebt = v[3]
    const variableRate = v[4]
    const stableDebt = s[8]
    const stableRate = s[9]

    const dailyInterest =
      (variableDebt * variableRate + stableDebt * stableRate) / (ONE_16_DP * DAYS_PER_YEAR)
    if (dailyInterest <= 0n) return

    const protocolRevenue = (dailyInterest * retentionRate) / ONE_16_DP
    const supplySideRevenue = dailyInterest - protocolRevenue

    const { assetId } = POOLS[idx]
    if (assetId === 0) {
      dailyFees.addCGToken('algorand', Number(dailyInterest) / ALGO_DECIMALS, METRIC.BORROW_INTEREST)
      dailyProtocolRevenue.addCGToken('algorand', Number(protocolRevenue) / ALGO_DECIMALS, METRIC.BORROW_INTEREST)
      dailySupplySideRevenue.addCGToken('algorand', Number(supplySideRevenue) / ALGO_DECIMALS, METRIC.BORROW_INTEREST)
    } else {
      dailyFees.add(String(assetId), dailyInterest.toString(), METRIC.BORROW_INTEREST)
      dailyProtocolRevenue.add(String(assetId), protocolRevenue.toString(), METRIC.BORROW_INTEREST)
      dailySupplySideRevenue.add(String(assetId), supplySideRevenue.toString(), METRIC.BORROW_INTEREST)
    }
  })

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Borrow interest paid across all v2 money-market pools.',
  Revenue: 'Protocol share of borrow interest.',
  ProtocolRevenue: 'Retention rate portion sent to the community treasury.',
  SupplySideRevenue: 'Remaining borrow interest paid to depositors.',
}

const breakdownMethodology = {
  Fees: { [METRIC.BORROW_INTEREST]: 'Variable + stable borrow interest across all pools.' },
  ProtocolRevenue: { [METRIC.BORROW_INTEREST]: 'retentionRate (10–30% per pool) × accrued interest.' },
  SupplySideRevenue: { [METRIC.BORROW_INTEREST]: '(1 − retentionRate) × accrued interest to depositors.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      start: '2022-04-12',
      runAtCurrTime: true,
    },
  },
}

export default adapter
