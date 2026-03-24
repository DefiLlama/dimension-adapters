import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const FEES_CHANGE_TIMESTAMP = 1770163200 // 2026-02-04

const fetch = async (_: number, _block: any, { startOfDayId, chain, fromTimestamp }: FetchOptions) => {
  const { volumeUSD, feesUSD } = await fetchURL(`https://api-b.metropolis.exchange/api/v1/defilama/daily-stats/${chain}/${startOfDayId}`)
  const feeDailyProtocolRevenue: number = fromTimestamp >= FEES_CHANGE_TIMESTAMP ? 0 : 0.05
  const feeDailyHoldersRevenue: number = fromTimestamp >= FEES_CHANGE_TIMESTAMP ? 0.2 : 0.15

  const dailyVolume = +volumeUSD
  const dailyFees = +feesUSD
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * 0.2,
    dailyProtocolRevenue: dailyFees * feeDailyProtocolRevenue,
    dailySupplySideRevenue: dailyFees * 0.8,
    dailyHoldersRevenue: dailyFees * feeDailyHoldersRevenue,
  }
};

// https://docs.metropolis.exchange/protocol/or-pools-and-farms/or-dlmm-lb
const methodology = {
  Fees: "Swap fees",
  Revenue: "20% of the swap fees",
  ProtocolRevenue: "0% of the swap fees",
  SupplySideRevenue: "80% of the swap fees",
  HoldersRevenue: "20% of the swap fees",
};

export default {
  fetch,
  start: "2024-12-16",
  chains: [CHAIN.SONIC],
  methodology,
}
