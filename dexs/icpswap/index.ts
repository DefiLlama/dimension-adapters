import { Adapter, FetchResultVolume, FetchOptions } from "../../adapters/types";import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch  = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { volumeUSD } = await fetchURL('https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/overview')
  
  options.toTimestamp = options.startOfDay;
  return {
    dailyVolume: volumeUSD,}
}


const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ICP],
  start: '2023-07-16',
  runAtCurrTime: true,
}

export default adapter;
