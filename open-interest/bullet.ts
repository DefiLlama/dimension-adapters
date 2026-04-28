import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const BASE_URL = "https://tradingapi.bullet.xyz";

async function fetch() {
  const [oiData, priceData] = await Promise.all([
    httpGet(`${BASE_URL}/fapi/v1/openInterest`),
    httpGet(`${BASE_URL}/fapi/v1/ticker/price`),
  ]);

  const priceMap: Record<string, number> = {};
  for (const p of priceData) {
    priceMap[p.symbol] = parseFloat(p.price);
  }

  const openInterestAtEnd = oiData.reduce((sum: number, market: any) => {
    const price = priceMap[market.symbol] ?? 0;
    return sum + parseFloat(market.openInterest) * price;
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
