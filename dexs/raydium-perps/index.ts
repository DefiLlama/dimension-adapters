import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const graphs = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
  const info: { "volume24h": number, "volume7d": number, "volume30d": number, } = (await fetchURL('https://api-perps-v1.raydium.io/main/info')).data

  return {
    dailyVolume: info.volume24h,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs,
      runAtCurrTime: true,
      start: '2024-01-01',
    },
  },
};

export default adapter;

