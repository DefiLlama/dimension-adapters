import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await fetchURL('https://api.pacifica.fi/api/v1/info')
  const tickers = data.data.map((tradeSummary: any) => tradeSummary.symbol)
  let volume = 0;
  await PromisePool.withConcurrency(1)
    .for(tickers)
    .process(async (ticker) => {
      const data = await fetchURLAutoHandleRateLimit(`https://api.pacifica.fi/api/v1/kline?symbol=${ticker}&interval=1d&start_time=${(options.startTimestamp) * 1000}`)
      const todaysData = data.data.filter((kline: any) => kline.t >= options.startTimestamp * 1000 && kline.T <= options.endTimestamp * 1000);
      if (todaysData.length === 0) return;
      volume += +todaysData[0].v * +todaysData[0].c;
    })

  return {
    dailyVolume: volume / 2, //Volumes in both directions are counted in klines
  }
}

export default {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09'
}