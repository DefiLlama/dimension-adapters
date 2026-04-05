import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { tickerToCgId } from "../../helpers/coingeckoIds";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const markets = (await fetchURL("https://indexer.dydx.trade/v4/perpetualMarkets")).markets;
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = Object.values(markets).reduce((a: number, b: any) => a+(Number(b.openInterest)*Number(b.oraclePrice)), 0)
  for (const market of Object.values(markets) as any[]) {
    const asset = market.ticker.split("-")[0];
    const cgId = tickerToCgId[asset];
    const oraclePrice = Number(market.oraclePrice);
    if (cgId && oraclePrice > 0) {
      dailyVolume.addCGToken(cgId, Number(market.volume24H) / oraclePrice);
    } else {
      dailyVolume.addUSDValue(Number(market.volume24H));
    }
  }
  return {
    dailyVolume,
    openInterestAtEnd,
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
