import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { proxiedFetch } from "../utils/fetchURL";

const MARKETS_URL = "https://api.storm.tg/api/markets";
const USD_SCALE = 1e9;

const fetch = async (_options: FetchOptions) => {
  // storm.tg's Cloudflare returns 403 to the server IP (2026-11); proxiedFetch routes through
  // PROXY_AUTH and falls back to a direct GET when no proxy is configured
  const markets = await proxiedFetch(MARKETS_URL);

  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;
  for (const market of markets) {
    if (market.settings.status !== "active") continue;
    longOpenInterestAtEnd += Number(market.amm.openInterestLong) / USD_SCALE;
    shortOpenInterestAtEnd += Number(market.amm.openInterestShort) / USD_SCALE;
  }

  return {
    // pool venue with no single-sided field: average the two sides instead of summing them
    openInterestAtEnd: (longOpenInterestAtEnd + shortOpenInterestAtEnd) / 2,
    longOpenInterestAtEnd: longOpenInterestAtEnd / 2,
    shortOpenInterestAtEnd: shortOpenInterestAtEnd / 2,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.TON],
};

export default adapter;
