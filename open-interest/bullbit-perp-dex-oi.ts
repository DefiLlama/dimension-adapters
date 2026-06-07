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
      return oi;
    });

  const openInterestAtEnd = oiResponses.reduce(
    (acc: number, oi: any) => acc + Number(oi.notionalValue),
    0
  );

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
