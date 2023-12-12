import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const fetchVolume = (chainId: string) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const raw = require('./astroport.json');
    const dailyVolume = raw.find((e: any) => e.timestamp === dayTimestamp)[chainId]['astroport'];

    return {
      timestamp: dayTimestamp,
      dailyVolume: dailyVolume,
    };
  };
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.INJECTIVE]: {
      fetch: fetchVolume(CHAIN.INJECTIVE),
      // runAtCurrTime: true,
      // customBackfill: undefined,
      start: async () => 1688860800,
    },
    neutron: {
      fetch: fetchVolume("neutron"),
      // runAtCurrTime: true,
      // customBackfill: undefined,
      start: async () => 1688860800,
    },
    terra2: {
      fetch: fetchVolume("terra"),
      // runAtCurrTime: true,
      // customBackfill: undefined,
      start: async () => 1688860800,
    },
  },
}
export default adapters;
