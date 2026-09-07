import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, ophisChainConfig } from "../../helpers/ophis";

const OPHIS_SETTLED_VOLUME = "Ophis settled swap volume";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const row = await fetchOphisChainDay(options);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(row?.volumeUsd ?? 0, OPHIS_SETTLED_VOLUME);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: ophisChainConfig,
  methodology: {
    Volume: "USD notional of successfully settled swaps routed through Ophis. Each GPv2Settlement Trade fill is counted once at settlement time, including partial fills, and underlying DEX hops are not double-counted.",
  },
  breakdownMethodology: {
    Volume: {
      [OPHIS_SETTLED_VOLUME]: "USD notional from Ophis' validated settlement-fill ledger.",
    },
  },
};

export default adapter;
