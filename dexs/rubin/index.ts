import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";

// Rubin — self-custody decentralized perpetual & spot exchange.
// Volume + open interest come from Rubin's public Comlink-style REST indexer:
// /v4/perpetualMarkets returns, per market, volume24H (rolling 24h USD),
// openInterest (base units) and oraclePrice (USD).
const fetch = async (_options: FetchOptions): Promise<FetchResultVolume> => {
  const markets = (await fetchURL("https://indexer.mainnet.rubin.trade/v4/perpetualMarkets")).markets;
  if (!markets || Object.keys(markets).length === 0) {
    throw new Error("Rubin indexer returned no perpetual markets");
  }
  const dailyVolume = Object.values(markets).reduce((a: number, b: any) => a + Number(b.volume24H), 0);
  const openInterestAtEnd = Object.values(markets).reduce((a: number, b: any) => a + (Number(b.openInterest) * Number(b.oraclePrice)), 0);
  return {
    dailyVolume,
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: ['rubin'],
  start: '2026-06-01',
  runAtCurrTime: true,
};

export default adapter;
