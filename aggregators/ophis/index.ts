import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchOphisChainDay, OPHIS_CHAINS } from "../../helpers/ophis";

const VOLUME_LABEL = "Settled Ophis Trades";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const row = await fetchOphisChainDay(options);
  if (row) dailyVolume.addUSDValue(row.volumeUsd, VOLUME_LABEL);
  return { dailyVolume };
};

const volumeMethodology = "USD value of settled Ophis-attributed trades. Ophis resolves each settled order's appData, deduplicates fills by trade UID, and prices the executed amount in its public reporting indexer.";

const adapter: SimpleAdapter = {
  fetch,
  start: "2026-05-14",
  chains: Object.keys(OPHIS_CHAINS),
  methodology: {
    Volume: volumeMethodology,
  },
  breakdownMethodology: {
    Volume: { [VOLUME_LABEL]: volumeMethodology },
  },
};

export default adapter;
