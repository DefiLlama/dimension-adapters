import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../../helpers/aggregators/bim";

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true }, '2758')
  return {
    dailyVolume,
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
