import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const chainConfig: Record<string, { api: string; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    api: "https://api.rh.lighter.xyz/api/v1",
    start: "2026-06-26",
  },
};

const fetch = async (options: FetchOptions) => {
  let dailyVolume = 0;
  const start = options.startOfDay;
  const { api } = chainConfig[options.chain];

  // Get all markets
  const markets = await httpGet(`${api}/orderBooks?market_id=255`);
  options.api.log('Lighter markets #', markets?.order_books?.length || 0);

  // Perp markets only; new perps use ids >= 4095, so filter on market_type, not the id range
  const filteredMarkets = markets.order_books.filter(({ market_type }: any) => market_type === 'perp');
  options.api.log('Perp markets #', filteredMarkets?.length || 0);

  await PromisePool.withConcurrency(1)
    .for(filteredMarkets)
    .process(async ({ market_id }: any) => {
      const params = {
        market_id,
        resolution: "1d",
        start_timestamp: start,
        end_timestamp: start + 1,
        count_back: 1,
      }
      const url = `${api}/candles?${new URLSearchParams(params as any).toString()}`;
      const data = await fetchURLAutoHandleRateLimit(url);

      const candle = data?.c?.[0];
      if (!candle) return;

        dailyVolume += Number(candle.V || 0); // already in $;
      });

  return { dailyVolume, };
};

const methodology = {
  Volume:
    "Daily trading volume is taken from Lighter's candlestick API (`resolution=1d`). `volume1` is already reported in USD notional.",
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
