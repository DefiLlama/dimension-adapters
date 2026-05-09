import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { DZAP_SUPPORTED_CHAINS, fetchChainWiseVolumeFromDZapAPI } from "../../helpers/aggregators/dzap";
import { CHAIN } from "../../helpers/chains";

const prefetch = async (options: FetchOptions) =>
  fetchChainWiseVolumeFromDZapAPI({ ...options, txType: "swap" });

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // bad data, wash trade
  if (options.startOfDay === 1750982400 && options.chain === CHAIN.ARBITRUM) {
    return {
      dailyVolume: 0,
    };
  }
  const volume = options.preFetchedResults[options.chain] ?? 0;
  return {
    dailyVolume: volume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.values(DZAP_SUPPORTED_CHAINS),
  start: "2023-01-01",
  prefetch,
};

export default adapter;
