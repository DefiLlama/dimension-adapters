import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const baseCGMap: any = {
  "GALA": 'gala',
  "GUSDC": 'usd-coin', "GUSDT": 'tether', "GSOL": 'solana', "$GMUSIC": 'gala-music', "GFARTCOIN": 'fartcoin',
}

async function fetch({ createBalances }: FetchOptions) {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const data = await httpGet('https://dex-backend-prod1.defi.gala.com/coin-gecko/tickers')
  data.forEach((item: any) => {
    const cgToken = baseCGMap[item.base_currency]
    if (!cgToken) {
      console.log('No CG mapping for', item.base_currency);
      return;
    }
    if (!item.base_volume) return;
    const fee = item.ticker_id.split('/')[2] / 1e6

    dailyVolume.addCGToken(cgToken, item.base_volume)
    dailyFees.addCGToken(cgToken, item.base_volume * fee)
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