import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../../helpers/aggregators/bim";

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyBridgeVolume } = await fetchBungeeData(options, { bridgeVolume: true }, '2758')
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
        start: '2024-10-01',
      }
    }
  }, {})
};

export default adapter;
