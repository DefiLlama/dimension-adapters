import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const TICKERS_URL = "https://api.templedigitalgroup.com/api/exchange/tickers";

type TempleTicker = {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  target_volume: string;
};

const fetch = async (_options: FetchOptions): Promise<FetchResultVolume> => {
  const tickers: TempleTicker[] = await fetchURL(TICKERS_URL);

  const dailyVolume = tickers.reduce((sum, ticker) => {
    return sum + Number(ticker.target_volume || 0);
  }, 0);

  return { dailyVolume };
};

const methodology = {
  Volume:
    "24h spot orderbook volume for all mainnet-enabled Temple Lightspeed markets, fetched from Temple's public exchange-listing API. The adapter sums each ticker's quote-side `target_volume`; current production markets quote in USDA, treated as USD-pegged volume.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  runAtCurrTime: true,
  methodology,
};

export default adapter;
