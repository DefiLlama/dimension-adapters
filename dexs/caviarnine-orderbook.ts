import { SimpleAdapter, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const url_orderbook = 'https://api-core.caviarnine.com/v1.0/stats/product/orderbook';
const url_trades = 'https://api-core.caviarnine.com/v1.0/stats/product/shapeliquidity';

const fetchSpot = async (): Promise<FetchResultVolume> => {
  let dailyVolume = 0;
  const orderbookVolume = (await fetchURL(url_orderbook)).summary.volume.interval_1d.usd;
  dailyVolume += Number(orderbookVolume);

  const dailyVolumeTrades = (await fetchURL(url_trades)).summary.volume.interval_1d.usd;
  dailyVolume += Number(dailyVolumeTrades);

  return {
    dailyVolume: dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: fetchSpot,
      start: '2023-10-31',
      runAtCurrTime: true,
    }
  }
}

export default adapter;
