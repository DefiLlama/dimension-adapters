import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const API_BASE = "https://defillama.america.fun/api/v1"

interface DailyFeesResponse {
  dailyFees: string
  dailyRevenue: string
  dailySupplySideRevenue: string
  meteoraFee: string
  timestamp: number
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: DailyFeesResponse = await httpGet(
    `${API_BASE}/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  )

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const feesUsd = parseFloat(data.dailyFees) || 0
  const revenueUsd = parseFloat(data.dailyRevenue) || 0
  const meteoraFeeUsd = parseFloat(data.meteoraFee) || 0
  const lpAndCreatorFeeUsd = (parseFloat(data.dailySupplySideRevenue) || 0) - meteoraFeeUsd

  if (feesUsd > 0) dailyFees.addUSDValue(feesUsd, "Swap Fees")
  if (revenueUsd > 0) dailyRevenue.addUSDValue(revenueUsd, "Swap Fees To Protocol")
  if (meteoraFeeUsd > 0) dailySupplySideRevenue.addUSDValue(meteoraFeeUsd, "Swap Fees To Meteora")
  if (lpAndCreatorFeeUsd > 0) dailySupplySideRevenue.addUSDValue(lpAndCreatorFeeUsd, "Swap Fees To Liquidity Providers")

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Gross trading fees from DBC and DAMM v2 pools, including Meteora's 20% protocol cut.",
  Revenue: "americafun protocol share allocated to the treasury and stakers.",
  SupplySideRevenue: "Meteora protocol fees plus fees distributed to liquidity providers and pool creators.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Gross trading fees collected from DBC (Dynamic Bonding Curve) and DAMM v2 liquidity pools, including Meteora's protocol cut.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share of trading fees allocated to the americafun treasury and stakers.",
  },
  SupplySideRevenue: {
    "Swap Fees To Meteora": "Meteora protocol fee: 20% of gross trading fees (applies to both DBC and DAMM v2 pools).",
    "Swap Fees To Liquidity Providers": "Share of trading fees paid to liquidity providers and pool creators.",
  },
}

const adapter: SimpleAdapter = {
  version: 1, //api updates once a day
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-20",
  methodology,
  breakdownMethodology,
}

export default adapter
