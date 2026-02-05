import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch(_: any, _1: any, { startOfDay }: FetchOptions) {
  const data = await fetchURL('https://machinex-api-production.up.railway.app/analytics')
  const record = data.dayData.find((day: any) => day.timestamp === startOfDay)

  return {
    dailyFees: record.legacy.feesUSD,
    dailyVolume: record.legacy.volumeUSD,
  }
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.PEAQ],
}