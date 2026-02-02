const endpoint = 'https://exchange-api.evedex.com/api/external/cmc/v1/contracts'
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_options: FetchOptions) => {
  const response = await fetchURL(endpoint);

  let openInterestAtEnd = 0
  let dailyVolume = 0
  for (const i of response) {
    openInterestAtEnd += i.open_interest_usd
    if (i.quote_currency === 'USD' && i.product_type === 'Perpetual') {
      dailyVolume += i.quote_volume
    }
  }

  return { openInterestAtEnd, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.EVENTUM]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
