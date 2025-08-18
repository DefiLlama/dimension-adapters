import { BreakdownAdapter, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url_aggregator = 'https://api-core.caviarnine.com/v1.0/stats/product/aggregator';
const url_orderbook = 'https://api-core.caviarnine.com/v1.0/stats/product/orderbook';
const url_trades = 'https://api-core.caviarnine.com/v1.0/stats/product/shapeliquidity';

const fetchSpot = async (timestamp: number): Promise<FetchResultVolume> => {
  let dailyVolume = 0;
  const orderbookVolume = (await fetchURL(url_orderbook)).summary.volume.interval_1d.usd;
  dailyVolume += Number(orderbookVolume);

  const dailyVolumeTrades = (await fetchURL(url_trades)).summary.volume.interval_1d.usd;
  dailyVolume += Number(dailyVolumeTrades);

  return {
    dailyVolume: dailyVolume,
    timestamp
  }
}

const adapters: BreakdownAdapter = {
  breakdown: {
    orderbook: {
      [CHAIN.RADIXDLT]: {
        fetch: fetchSpot,
        start: '2023-10-31',
        // runAtCurrTime: true
      }
    },
    aggregator: {
      [CHAIN.RADIXDLT]: {
        fetch: async (timestamp: number): Promise<FetchResultVolume> => {
          const data = (await fetchURL(url_aggregator)).volume_by_resource;
          const dailyVolume = Object.keys(data).reduce((acc, key) => {
            return acc + Number(data[key].interval_1d.usd);
          }, 0);
          return {
            dailyVolume: dailyVolume,
            timestamp
          }
        },
        start: '2023-10-31',
        // runAtCurrTime: true
      }
    }
  }
}
export default adapters;
