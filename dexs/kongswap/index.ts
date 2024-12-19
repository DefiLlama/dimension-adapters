import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const response = await fetchURL('https://api.kongswap.io/api/defillama/total_volume');
  return {
    dailyVolume: response['24h_volume'],
    timestamp
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2024-11-01',
    },
  }
}

export default adapter;
