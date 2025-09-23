import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_: any) => {
  let openInterestAtEnd = 0;
  const data = await fetchURL('https://api.kwenta.io/perpsV3/markets');
  if (data && data.success && data.data && Array.isArray(data.data.markets)) {
    data.data.markets.forEach((market: any) => {
      if (market.provider === 'snx_v3_base' && !market.isSuspended) {
        openInterestAtEnd += Number(market.openInterest?.longUSD || 0);
        openInterestAtEnd += Number(market.openInterest?.shortUSD || 0);
      }
    });
  }
  return { openInterestAtEnd }
}

const adapters: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2024-01-13',
  runAtCurrTime: true,
}

export default adapters
