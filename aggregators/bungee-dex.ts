import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../helpers/aggregators/bungee";

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true })
  return { 
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  pullHourly: true,
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
