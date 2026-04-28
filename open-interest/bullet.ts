import PromisePool from "@supercharge/promise-pool";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const BASE_URL = "https://tradingapi.bullet.xyz";

async function fetch() {
  const endpoints = [
    { key: "oi", url: `${BASE_URL}/fapi/v1/openInterest` },
    { key: "prices", url: `${BASE_URL}/fapi/v1/ticker/price` },
  ];
  const data: Record<string, any> = {};
  const { errors } = await PromisePool.withConcurrency(2)
    .for(endpoints)
    .process(async ({ key, url }) => { data[key] = await httpGet(url); });
  if (errors.length) throw errors[0];
  const { oi: oiData, prices: priceData } = data;

  const priceMap: Record<string, number> = {};
  for (const p of priceData) {
    priceMap[p.symbol] = parseFloat(p.price);
  }

  const openInterestAtEnd = oiData.reduce((sum: number, market: any) => {
    const price = priceMap[market.symbol];
    if (price === undefined) throw new Error(`Missing ticker price for symbol: ${market.symbol}`);
    const oi = parseFloat(market.openInterest);
    return sum + (Number.isFinite(oi) ? oi * price : 0);
  }, 0);

  return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-12",
  runAtCurrTime: true,
};

export default adapter;
