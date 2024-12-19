import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const response = await fetchURL('https://api.kongswap.io/api/defillama/total_volume');
  const { '24h_volume': dailyVolume } = response;
  
  timestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  return {
    dailyVolume, // Assign correctly fetched value
    timestamp
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: false,
      start: '2024-11-01',
    },
  }
}

export default adapter;