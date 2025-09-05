import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function fetch({ createBalances }:FetchOptions) {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const data = await httpGet('https://dex-backend-prod1.defi.gala.com/coin-gecko/tickers')
  data.forEach((item: any) => {
    const fee = item.ticker_id.split('/')[2] / 1e6
    const vol = item.base_volume	+ item.target_volume
    dailyVolume.addUSDValue(vol)
    dailyFees.addUSDValue(vol * fee)
  })


  return { dailyVolume, dailyFees }
}

export default {
  version: 2,
  runAtCurrTime: true,
  fetch,
  start: '2025-09-03',
  chains: [CHAIN.GALA],
}