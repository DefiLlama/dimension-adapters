import PromisePool from "@supercharge/promise-pool";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const baseUrl = "https://app.bullbit.ai/api";

const fetch = async (_options: FetchOptions) => {
  const tickers = await fetchURL(`${baseUrl}/perp/v1/ticker/24hr`);
  const symbols: string[] = tickers.map((t: any) => t.symbol);

  const { results: oiResponses } = await PromisePool.withConcurrency(3)
    .for(symbols)
    .process(async (symbol: string) => {
      const oi = await fetchURLAutoHandleRateLimit(`${baseUrl}/perp/v1/open-interest?symbol=${symbol}`);
      await sleep(500);
      return { symbol, oi };
    });

  // A symbol can be listed on /ticker/24hr while /open-interest answers 200 with
  // {"success":false,"error":{"code":"NOTFOUND"}} and no notionalValue. Skip those instead of
  // letting one of them turn the whole sum into NaN; the guard below still fires if every
  // symbol fails.
  const openInterestAtEnd = oiResponses.reduce((acc: number, { symbol, oi }: any) => {
    const notionalValue = Number(oi?.notionalValue);
    if (!Number.isFinite(notionalValue)) {
      console.info(`bullbit: no open interest returned for ${symbol}, skipping it`);
      return acc;
    }
    return acc + notionalValue;
  }, 0);

  if (!openInterestAtEnd)
    throw new Error("No open interest data found");

  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
};

export default adapter;
