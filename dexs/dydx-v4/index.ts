import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const markets = (await fetchURL("https://indexer.dydx.trade/v4/perpetualMarkets")).markets;
  const dailyolume = Object.values(markets).reduce((a: number, b: any) => a+Number(b.volume24H), 0)
  const dailyOpenInterest = Object.values(markets).reduce((a: number, b: any) => a+(Number(b.openInterest)*Number(b.oraclePrice)), 0)
  return {
    dailyVolume: dailyolume,
    dailyOpenInterest: dailyOpenInterest,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    "dydx": {
      runAtCurrTime:true,
      fetch,
      start: '2021-02-25',
    },
  },
};

export default adapter;
