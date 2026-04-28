import PromisePool from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const BASE_URL = "https://tradingapi.bullet.xyz";

async function fetch() {
  const endpoints = [
    { key: "exchangeInfo", url: `${BASE_URL}/fapi/v1/exchangeInfo` },
    { key: "tickers", url: `${BASE_URL}/fapi/v1/ticker/24hr` },
  ];
  const data: Record<string, any> = {};
  const { errors } = await PromisePool.withConcurrency(2)
    .for(endpoints)
    .process(async ({ key, url }) => { data[key] = await httpGet(url); });
  if (errors.length) throw errors[0];
  const { exchangeInfo, tickers } = data;

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

const methodology = {
  Volume: "Sum of notional quote volume (in USD) across all perpetual markets over the rolling 24-hour window.",
};

const adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: "2026-02-12",
    },
  },
};

export default adapter;
