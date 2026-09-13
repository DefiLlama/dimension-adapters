import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const markets = (await fetchURL("https://indexer.dydx.trade/v4/perpetualMarkets")).markets;
  const dailyVolume = options.createBalances();
  let openInterestAtEnd = 0;
  for (const market of Object.values(markets) as any[]) {
    const baseAsset = String(market.ticker).split("-")[0]; // "BTC-USD" -> "BTC"
    dailyVolume.addUSDValue(Number(market.volume24H), { id: baseAsset, isUSDValue: true });
    openInterestAtEnd += Number(market.openInterest) * Number(market.oraclePrice);
  }
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
