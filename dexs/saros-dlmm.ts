import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import { httpGet } from "../utils/fetchURL"

const blacklistTokens = [
  // 'uniBKsEV37qLRFZD7v3Z9drX6voyiCM8WcaePqeSSLc', // uniBTC wash trading
  // 'CtzPWv73Sn1dMGVU3ZtLv9yWSyUAanBni19YWDaznnkn', // XBTC was trading
  '7hc6hXjDPcFnhGBPBGTKUtViFsQuyWw8ph4ePHF1aTYG',
]

async function fetch() {
  const { data: { data } } = await httpGet('https://api.saros.xyz/api/dex-v3/pool?size=99&order=-volume24h&page=1')

  let dailyVolume = 0
  let dailyFees = 0
  for (const pool of data) {
    if (pool.pairs.map((item: any) => item.pair).includes('7hc6hXjDPcFnhGBPBGTKUtViFsQuyWw8ph4ePHF1aTYG')) {
      continue;
    }

    dailyVolume += Number(pool.volume24h)
    dailyFees += Number(pool.fees24h)
  }

  return { dailyVolume, dailyFees, }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};
export default adapter;
