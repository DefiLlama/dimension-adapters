import axios from "axios";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = (chain: string) => `https://${chain}.defibox.io/api/swap/get24HInfo`

interface IVolume {
  volume: string;
  volume_usd_24h: string;
}
const graph = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const response: IVolume = chain !== CHAIN.BSC ? (await fetchURL(endpoint(chain)))?.data.data : (await axios.post(endpoint(chain), {} , { headers: {chainid: 56} })).data.data;

    return {
      dailyVolume: response?.volume ? `${response?.volume}` : response?.volume_usd_24h ? `${response?.volume_usd_24h}`: undefined,
      timestamp: dayTimestamp,
    };
  };
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch: graph(CHAIN.EOS),
      start: async () => 1674345600,
      runAtCurrTime: true,
    },
    [CHAIN.WAX]: {
      fetch: graph(CHAIN.WAX),
      start: async () => 1674345600,
      runAtCurrTime: true,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async () => 1674345600,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
