import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function fetch(_: any, _2: any, { dateString }: FetchOptions) {
  const { volumeUSD: dailyVolume, feesUSD: dailyFees } = await httpGet('https://dex-backend-prod1.defi.gala.com/dex/pairs/volume-fees?date=' + dateString);
  return { dailyVolume, dailyFees }
}

export default {
  fetch,
  start: '2025-09-03',
  chains: [CHAIN.GALA],
}