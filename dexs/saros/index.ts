import axios from "axios";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

interface IVolume {
  tvl: number;
  volume24h: number;
  totalvolume: number;
}
const URL = "https://api.saros.finance/info";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
    const res: IVolume = (await axios.get(URL, { headers: {  'origin': 'https://saros.finance' }})).data;
    return {
      timestamp: timestamp,
      dailyVolume: res.volume24h ? `${res.volume24h}` : undefined,
      totalVolume: res.totalvolume ? `${res.totalvolume}`: undefined,
    }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 1673827200,
    },
  },
};
export default adapter;
