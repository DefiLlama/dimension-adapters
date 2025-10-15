import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function fetch() {
  const { data } = await httpGet('https://api-dex.colorpool.xyz/pool/list?page=1&limit=2500&sortField=volume1d&sortOrder=desc')
  let dailyFees = 0

  for (const pool of data) {
    dailyFees += pool.fee24h
  }
  return {
    dailyFees,
  }
}

export default {
  runAtCurrTime: true,
  fetch,
  start: '2025-07-22',
  chains: [CHAIN.CHROMIA],
}