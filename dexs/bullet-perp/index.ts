import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const BASE_URL = "https://tradingapi.bullet.xyz";

async function fetch() {
  const [exchangeInfo, tickers] = await Promise.all([
    httpGet(`${BASE_URL}/fapi/v1/exchangeInfo`),
    httpGet(`${BASE_URL}/fapi/v1/ticker/24hr`),
  ]);

  const perpSymbols = new Set<string>(
    exchangeInfo.symbols
      .filter((s: any) => s.contractType === "Perp")
      .map((s: any) => s.symbol)
  );

  const dailyVolume = tickers
    .filter((ticker: any) => perpSymbols.has(ticker.symbol))
    .reduce((sum: number, ticker: any) => sum + parseFloat(ticker.quoteVolume), 0);

  return { dailyVolume };
}

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: "2026-02-12",
    },
  },
};

export default adapter;
