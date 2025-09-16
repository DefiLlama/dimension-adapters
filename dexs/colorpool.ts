import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
let data: any

async function fetch(_:any, _1: any, { dateString }: FetchOptions) {
  if (!data) data = httpGet('https://api-dex.colorpool.xyz/pool/volume-history?timeframe=1D')
  data = await data
  const dayData = data.find((day: any) => day.date.startsWith(dateString))
  if (!dayData) throw new Error("No data for date: " + dateString)
  return {
    dailyVolume: dayData.volume,
  }
}

export default {
  fetch,
  start: '2025-07-22',
  chains: [CHAIN.CHROMIA],
}