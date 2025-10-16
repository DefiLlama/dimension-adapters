import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromPactswapAPI, PACTSWAP_SUPPORTED_CHAINS } from "./pactswap";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const timeframes = await fetchVolumeFromPactswapAPI(options.chain, options.startTimestamp, options.endTimestamp);

  const dailyVolume = options.createBalances();
  timeframes.forEach(({ volume }) => {
    dailyVolume.addUSDValue(Number(volume));
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Array.from(PACTSWAP_SUPPORTED_CHAINS)
};
  
export default adapter;