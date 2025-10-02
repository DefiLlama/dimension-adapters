import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

type FutureContracts = {
  info: {
    markPrice: string;
    openInterestQuantity: string;
  };
};

interface Response {
  markets: FutureContracts[];
}

const fetch = async (options: FetchOptions) => {
  const response: Response = await fetchURL(
    "https://data-api.hibachi.xyz/market/inventory"
  );

  let openInterestAtEnd = 0
  for (const market of response.markets) {
    openInterestAtEnd += Number(market.info.markPrice) * Number(market.info.openInterestQuantity)
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HIBACHI]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-06-01",
    },
  },
};

export default adapter;
