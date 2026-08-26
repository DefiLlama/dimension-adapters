import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, ophisChainConfig } from "../../helpers/ophis";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const row = await fetchOphisChainDay(options);
  return { dailyVolume: row?.volumeUsd ?? 0 };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: ophisChainConfig,
  methodology: {
    Volume: "USD notional of successfully settled swaps routed through Ophis. Each GPv2Settlement Trade fill is counted once at settlement time, including partial fills, and underlying DEX hops are not double-counted.",
  },
};

export default adapter;
