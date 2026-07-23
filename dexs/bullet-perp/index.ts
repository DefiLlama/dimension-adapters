import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";

const BASE_URL = "https://tradingapi.bullet.xyz";

async function fetch(_: any) {
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
    .reduce((sum: number, ticker: any) => {
      const vol = Number(ticker.quoteVolume);
      if (!Number.isFinite(vol)) throw new Error(`Invalid quoteVolume for symbol: ${ticker.symbol}`);
      return sum + vol;
    }, 0);

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  start: "2026-02-12",
}

export default adapter;
