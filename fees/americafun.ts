import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const API_BASE = "https://defillama.america.fun/api/v1"

interface DailyFeesResponse {
  dailyFees: string
  dailyRevenue: string
  dailyProtocolRevenue: string
  dailyHoldersRevenue: string
  dailySupplySideRevenue: string
  meteoraFee: string
  timestamp: number
}

const fetch = async (options: FetchOptions) => {
  const data: DailyFeesResponse = await httpGet(
    `${API_BASE}/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  )

  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const protocolRevenueUsd = parseFloat(data.dailyProtocolRevenue) || 0
  const holdersRevenueUsd = parseFloat(data.dailyHoldersRevenue) || 0
  const meteoraFeeUsd = parseFloat(data.meteoraFee) || 0
  const lpFeeUsd = (parseFloat(data.dailySupplySideRevenue) || 0) - meteoraFeeUsd
  const supplySideBookedUsd = meteoraFeeUsd + Math.max(lpFeeUsd, 0)

  // on healthy days the endpoint maintains dailyFees = dailyProtocolRevenue +
  // dailyHoldersRevenue + dailySupplySideRevenue exactly, but on some days it
  // returns a total far below its own components (revenue 5x fees), and on
  // others meteoraFee exceeds dailySupplySideRevenue - floor the total at the
  // sum of what gets booked below so revenue can never exceed fees
  const bookedComponentsUsd =
    protocolRevenueUsd + holdersRevenueUsd + supplySideBookedUsd
  const feesUsd = Math.max(parseFloat(data.dailyFees) || 0, bookedComponentsUsd)
  // if the reported total is instead the larger side, book the remainder into
  // revenue so dailyFees = dailyRevenue + dailySupplySideRevenue still holds
  const unattributedFeesUsd = feesUsd - bookedComponentsUsd

  if (feesUsd > 0) dailyFees.addUSDValue(feesUsd, "Swap Fees")
  if (protocolRevenueUsd > 0) dailyProtocolRevenue.addUSDValue(protocolRevenueUsd, "Swap Fees To Treasury")
  if (holdersRevenueUsd > 0) dailyHoldersRevenue.addUSDValue(holdersRevenueUsd, "Swap Fees To Stakers")
  if (meteoraFeeUsd > 0) dailySupplySideRevenue.addUSDValue(meteoraFeeUsd, "Swap Fees To Meteora")
  if (lpFeeUsd > 0) dailySupplySideRevenue.addUSDValue(lpFeeUsd, "Swap Fees To Liquidity Providers")

  const dailyRevenue = dailyProtocolRevenue.clone()
  dailyRevenue.addBalances(dailyHoldersRevenue)
  if (unattributedFeesUsd > 0) dailyRevenue.addUSDValue(unattributedFeesUsd, "Swap Fees Unattributed")

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Gross trading fees collected from DBC (Dynamic Bonding Curve) and DAMM v2 liquidity pools, including Meteora's protocol cut.",
  },
  Revenue: {
    "Swap Fees To Treasury": "Fees allocated to the americafun treasury.",
    "Swap Fees To Stakers": "Fees distributed to americafun governance token stakers.",
    "Swap Fees Unattributed": "Remainder on days the reported fee total exceeds the sum of its attributed components.",
  },
  ProtocolRevenue: {
    "Swap Fees To Treasury": "Fees allocated to the americafun treasury.",
  },
  HoldersRevenue: {
    "Swap Fees To Stakers": "Fees distributed to americafun governance token stakers.",
  },
  SupplySideRevenue: {
    "Swap Fees To Meteora": "Meteora protocol fee: 20% of gross trading fees (applies to both DBC and DAMM v2 pools).",
    "Swap Fees To Liquidity Providers": "Share of trading fees paid to liquidity providers.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-20",
  methodology: {
    Fees: "Gross trading fees from DBC and DAMM v2 pools, including Meteora's 20% protocol cut.",
    Revenue: "americafun protocol share: treasury and staker portions of trading fees.",
    ProtocolRevenue: "Fees allocated to the americafun treasury.",
    HoldersRevenue: "Fees distributed to americafun governance token stakers.",
    SupplySideRevenue: "Meteora protocol fees plus fees distributed to liquidity providers.",
  },
  breakdownMethodology,
}

export default adapter
