import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import fetchURL from "../../utils/fetchURL";

const fetch  = async (timestamp: number): Promise<FetchResultVolume> => {
  const { volumeUSD } = await fetchURL('https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/overview')
  
  timestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  return {
    dailyVolume: volumeUSD,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-07-16',
    },
  }
}

export default adapter;
