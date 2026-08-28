import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const MARKETS_URL = "https://api.storm.tg/api/markets";
const USD_SCALE = 1e9;

const fetch = async (_options: FetchOptions) => {
  const markets = await fetchURL(MARKETS_URL);

  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;
  for (const market of markets) {
    if (market.settings.status !== "active") continue;
    longOpenInterestAtEnd += Number(market.amm.openInterestLong) / USD_SCALE;
    shortOpenInterestAtEnd += Number(market.amm.openInterestShort) / USD_SCALE;
  }

  return {
    openInterestAtEnd: longOpenInterestAtEnd + shortOpenInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.TON],
};

export default adapter;
