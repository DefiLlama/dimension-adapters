import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await fetchURL('https://api.pacifica.fi/api/v1/info')
  if (!data.data){
    throw new Error('Tickers are unavailable, please try again later');
  }

  const tickers = data.data.map((tradeSummary: any) => tradeSummary.symbol)
  let dailyVolume = 0;

  const { errors } = await PromisePool.withConcurrency(1)
    .for(tickers)
    .process(async (ticker) => {
      const data = await fetchURLAutoHandleRateLimit(`https://api.pacifica.fi/api/v1/kline?symbol=${ticker}&interval=1d&start_time=${(options.startOfDay) * 1000}`)
      const todaysData = data.data.filter((kline: any) => kline.t == options.startOfDay * 1000);
      const volume = (todaysData[0].v * +todaysData[0].c) / 2; // They include taker + maker in ohlcv candles
      dailyVolume += volume;
      await new Promise(r => setTimeout(r, 1000));
    })

  if (errors.length > 0) {
    throw new Error(`Failed to fetch data for ${errors.length} ticker(s): ${errors.map(e => e.message).join(', ')}`);
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09'
}

export default adapter;
