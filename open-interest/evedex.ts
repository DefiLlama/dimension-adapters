const endpoint = 'https://exchange-api.evedex.com/api/external/cmc/v1/contracts'
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_options: FetchOptions) => {
  const response = await fetchURL(endpoint);

  let openInterestAtEnd = 0
  for (const i of response) {
    openInterestAtEnd += i.open_interest_usd
  }

  return { openInterestAtEnd };
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
