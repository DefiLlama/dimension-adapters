import axios from "axios";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = (chain: string) => `https://${chain}.defibox.io/api/swap/get24HInfo`
const bal_endpoint = "https://eos.defibox.io/api/bal/get24HInfo"

interface IVolume {
  volume_usd_24h: string;
}
const graph = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    let volume = 0
    if(chain === CHAIN.EOS){
     const bal_reponse: IVolume = (await fetchURL(bal_endpoint))?.data.data
     const swap_response: IVolume = (await fetchURL(endpoint(chain)))?.data.data
     volume = (bal_reponse?.volume_usd_24h? Number(bal_reponse.volume_usd_24h): 0) +(swap_response?.volume_usd_24h?Number(swap_response.volume_usd_24h):0)
    }else{
      const response: IVolume = chain !== CHAIN.BSC ? (await fetchURL(endpoint(chain)))?.data.data : (await axios.post(endpoint(chain), {} , { headers: {chainid: 56} })).data.data;
      volume = response?.volume_usd_24h ? Number(response.volume_usd_24h): 0
    }

    return {
      dailyVolume: volume === 0? undefined: `${volume}`,
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
    // [CHAIN.BSC]: {
    //   fetch: graph(CHAIN.BSC),
    //   start: async () => 1674345600,
    //   runAtCurrTime: true,
    // },
  },
};

export default adapter;
