import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, OPHIS_CHAINS } from "../../helpers/ophis";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const row = await fetchOphisChainDay(options);
  if (row) dailyVolume.addUSDValue(row.volumeUsd);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  start: "2026-05-14",
  chains: Object.keys(OPHIS_CHAINS),
  methodology: {
    Volume: "USD value of settled Ophis-attributed trades. Ophis resolves each settled order's appData, deduplicates fills by trade UID, and prices the executed amount in its public reporting indexer.",
  },
};

export default adapter;
