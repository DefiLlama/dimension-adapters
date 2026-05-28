import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const API_BASE = "https://americafun-api.up.railway.app/api/v1"

interface DailyFeesResponse {
  dailyFees: string
  dailyRevenue: string
  dailySupplySideRevenue: string
  timestamp: number
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: DailyFeesResponse = await httpGet(
    `${API_BASE}/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  )

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const feesUsd = parseFloat(data.dailyFees)
  const revenueUsd = parseFloat(data.dailyRevenue)
  const supplySideUsd = parseFloat(data.dailySupplySideRevenue)

  if (feesUsd > 0) dailyFees.addUSDValue(feesUsd, "Swap Fees")
  if (revenueUsd > 0) dailyRevenue.addUSDValue(revenueUsd, "Swap Fees To Protocol")
  if (supplySideUsd > 0) dailySupplySideRevenue.addUSDValue(supplySideUsd, "Swap Fees To Liquidity Providers")

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Trading fees collected from DBC (Dynamic Bonding Curve) and DAMM v2 liquidity pools.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share of trading fees allocated to the treasury and stakers.",
  },
  SupplySideRevenue: {
    "Swap Fees To Liquidity Providers": "Share of trading fees paid to liquidity providers and pool creators.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-20",
  methodology: {
    Fees: "Total trading fees collected from DBC (Dynamic Bonding Curve) and DAMM v2 liquidity pools.",
    Revenue: "Protocol share of trading fees allocated to the treasury and stakers.",
    SupplySideRevenue: "Share of trading fees paid to liquidity providers and pool creators.",
  },
  breakdownMethodology,
}

export default adapter
