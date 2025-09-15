import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";


const API = "https://mainnet.zklighter.elliot.ai/api/v1";

const fetch = async (options: FetchOptions) => {
  let dailyVolume = 0;
  const start = getUniqStartOfTodayTimestamp(new Date(options.startTimestamp * 1000));
  const end = getUniqStartOfTodayTimestamp(new Date(options.startTimestamp * 1000)) + 1;

  // Get all markets
  const markets = await httpGet(`${API}/orderBooks?market_id=255`);

  for (const market of markets.order_books) {
    const { market_id } = market;
    const params = {
      market_id,
      resolution: "1d",
      start_timestamp: start,
      end_timestamp: end,
      count_back: 1,
    }
    const data = await httpGet(`${API}/candlesticks`, {
      params: params,
    });

    const candle = data?.candlesticks?.[0];
    if (!candle) continue;

    dailyVolume += Number(candle.volume1 || 0); // already in $;
  }

  return { dailyVolume, timestamp: start };
};

const methodology = {
  Volume:
    "Daily trading volume is taken from Lighter's candlestick API (`resolution=1d`). `volume1` is already reported in USD notional.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-01-17",       // earliest candlestick data available
  methodology,
};

export default adapter;
