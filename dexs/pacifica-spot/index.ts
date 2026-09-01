import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL('https://api.pacifica.fi/api/v1/info')
  if (!data.data) {
    throw new Error('Tickers are unavailable, please try again later');
  }

  const tickers = data.data
    .filter((tradeSummary: any) => tradeSummary.instrument_type === 'spot')
    .map((tradeSummary: any) => tradeSummary.symbol)
  let dailyVolume = 0;

  const { errors } = await PromisePool.withConcurrency(1)
    .for(tickers)
    .process(async (ticker) => {
      const data = await fetchURLAutoHandleRateLimit(`https://api.pacifica.fi/api/v1/kline?symbol=${ticker}&interval=1d&start_time=${(options.startOfDay) * 1000}`)
      const todaysData = data.data.find((kline: any) => kline.t == options.startOfDay * 1000);
      if (todaysData) dailyVolume += (todaysData.v * +todaysData.c) / 2; // They include taker + maker in ohlcv candles
      await new Promise(r => setTimeout(r, 4000));
    })

  if (errors.length) throw errors[0];

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-04-20'
}

export default adapter;
