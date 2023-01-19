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
const headers = {
  'origin': 'https://saros.finance',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
}
const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
    const res: IVolume = (await axios.get(URL, { headers: headers})).data;
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
