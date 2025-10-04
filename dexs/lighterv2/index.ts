import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";


const API = "https://mainnet.zklighter.elliot.ai/api/v1";

const fetch = async (_1: any, _2: any, options: FetchOptions) => {
  let dailyVolume = 0;
  const start = options.startOfDay;

  // Get all markets
  const markets = await httpGet(`${API}/orderBooks?market_id=255`);
  options.api.log('Lighter markets #', markets?.order_books?.length || 0);

  await PromisePool.withConcurrency(5)
    .for(markets.order_books)
    .process(async ({ market_id }: any) => {
      const params = {
        market_id,
        resolution: "1d",
        start_timestamp: start,
        end_timestamp: start + 1,
        count_back: 1,
      }
      const data = await httpGet(`${API}/candlesticks`, { params: params, });

      const candle = data?.candlesticks?.[0];
      if (!candle) return;

      dailyVolume += Number(candle.volume1 || 0); // already in $;
    });

  return { dailyVolume, };
};

const methodology = {
  Volume:
    "Daily trading volume is taken from Lighter's candlestick API (`resolution=1d`). `volume1` is already reported in USD notional.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  start: "2025-01-17",       // earliest candlestick data available
  methodology,
};

export default adapter;