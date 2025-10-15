import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

let data: any

async function fetch(_:any, _1: any, { startOfDay, dateString }:FetchOptions) {
  if (!data) data = httpGet('https://machinex-api-production.up.railway.app/analytics')
    data = await data
  const record = data.find((day: any) => day.timestamp === startOfDay)
  if (!record || !record.cl) throw new Error(`No data for ${dateString}`)
  return {
    dailyFees: record.cl.feesUSD,
    dailyVolume: record.cl.volumeUSD,
  }
}

export default {
  fetch,
  chains: [CHAIN.PEAQ],
}