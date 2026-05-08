import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { DZAP_SUPPORTED_CHAINS, fetchChainWiseVolumeFromDZapAPI } from "../../helpers/aggregators/dzap";

const prefetch = async (options: FetchOptions): Promise<FetchResultV2> =>
  fetchChainWiseVolumeFromDZapAPI({ ...options, txType: "bridge" });

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const volume = options.preFetchedResults[options.chain] ?? 0;

  return {
    dailyBridgeVolume: volume,
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
