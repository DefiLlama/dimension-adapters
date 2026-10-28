import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";

const fetch = async (_options: FetchOptions): Promise<FetchResultVolume> => {
  const markets = (await fetchURL("https://indexer.dydx.trade/v4/perpetualMarkets")).markets;
  const dailyVolume = Object.values(markets).reduce((a: number, b: any) => a+Number(b.volume24H), 0)
  const openInterestAtEnd = Object.values(markets).reduce((a: number, b: any) => a+(Number(b.openInterest)*Number(b.oraclePrice)), 0)
  return {
    dailyVolume,
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: ['dydx'],
  start: '2023-10-26',
  runAtCurrTime: true,
};

export default adapter;
