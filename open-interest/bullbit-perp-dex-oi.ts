import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const baseUrl = "https://app.bullbit.ai/api";

const fetch = async (_: any) => {
  const tickers = await fetchURL(`${baseUrl}/perp/v1/ticker/24hr`);
  const symbols: string[] = tickers.map((t: any) => t.symbol);

  const oiResponses = await Promise.all(
    symbols.map((symbol: string) =>
      fetchURL(`${baseUrl}/perp/v1/open-interest?symbol=${symbol}`)
    )
  );

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
  start: "2026-03-27",
};

export default adapter;
