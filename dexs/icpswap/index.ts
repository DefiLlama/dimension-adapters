import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch  = async (timestamp: number): Promise<FetchResultVolume> => {
  const { volumeUSD } = await fetchURL('https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/overview')
  return {
    dailyVolume: volumeUSD,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      start: 1689465600,
    },
  }
}

export default adapter;
