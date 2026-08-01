import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

export default {
  chains: [CHAIN.SOMNIA],
  fetch,
  runAtCurrTime: true,
  methodology: {
    Fees: "0.3% of total swap volume",
    Revenue: "0% of total swap volume",
    SupplySideRevenue: "0.3% of total swap volume",
  },
  start: "2025-09-05"
}

async function fetch() {
  const { data } = await httpGet('https://api.somnia.exchange/api/pairs?chainId=5031&page=1&limit=1000&sortBy=volumeUSD&sortOrder=desc')
  const dailyVolume = data.reduce((a: number, b: { volumeUSD: number }) => a + Number(b.volumeUSD), 0)
  return { dailyVolume, dailyFees: dailyVolume * 0.003, dailySupplySideRevenue: dailyVolume * 0.003, dailyRevenue: 0 }
}