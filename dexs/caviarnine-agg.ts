import { SimpleAdapter, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const url_aggregator = 'https://api-core.caviarnine.com/v1.0/stats/product/aggregator';

const volumeThreshold = 50_000_000;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: async (): Promise<FetchResultVolume> => {
        const data = (await fetchURL(url_aggregator)).volume_by_resource;
        const dailyVolume = Object.keys(data).reduce((acc, key) => {
          return acc + Number(data[key].interval_1d.usd);
        }, 0);
        return {
          dailyVolume: dailyVolume > volumeThreshold ? 0 : dailyVolume,
        }
      },
      start: '2023-10-31',
      runAtCurrTime: true,
    }
  }
}

export default adapter;
