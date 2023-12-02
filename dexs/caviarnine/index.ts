import { BreakdownAdapter, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url_aggregator = 'https://api-core.caviarnine.com/v1.0/stats/product/aggregator';
const url_orderbook = 'https://api-core.caviarnine.com/v1.0/stats/product/orderbook';
const url_trades = 'https://api-core.caviarnine.com/v1.0/stats/product/shapeliquidity';

const fetchSpot = async (timestamp: number): Promise<FetchResultVolume> => {
  const orderbookVolume = (await fetchURL(url_orderbook)).data.summary.volume.interval_1d.usd;
  const dailyVolumeTrades = (await fetchURL(url_trades)).data.summary.volume.interval_1d.usd;
  const dailyVolume = Number(orderbookVolume) + Number(dailyVolumeTrades);
  return {
    dailyVolume: `${dailyVolume}`,
    timestamp
  }
}

const adapters: BreakdownAdapter = {
  breakdown: {
    orderbook: {
      [CHAIN.RADIXDLT]: {
        fetch: fetchSpot,
        start: async () => 1698710400,
        // runAtCurrTime: true
      }
    },
    aggregator: {
      [CHAIN.RADIXDLT]: {
        fetch: async (timestamp: number): Promise<FetchResultVolume> => {
          const data = (await fetchURL(url_aggregator)).data.volume_by_resource;
          const dailyVolume = Object.keys(data).reduce((acc, key) => {
            return acc + Number(data[key].interval_1d.usd);
          }, 0);
          return {
            dailyVolume: `${dailyVolume}`,
            timestamp
          }
        },
        start: async () => 1698710400,
        // runAtCurrTime: true
      }
    }
  }
}
export default adapters;
