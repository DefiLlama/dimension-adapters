import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains } from "../../aggregators/bim/config";


const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyBridgeVolume } = await fetchBungeeData(options, { bridgeVolume: true }, '2758')
  return {
    dailyBridgeVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, //Bungee
  adapter: fetchBimChains().reduce((acc, chain) => {
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