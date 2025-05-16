import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../../helpers/aggregators/bungee";

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyBridgeVolume } = await fetchBungeeData(options, { bridgeVolume: true })
  return { 
    dailyBridgeVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: fetchBungeeChains().reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: '2023-08-10',
      }
    }
  }, {})
};

export default adapter;
