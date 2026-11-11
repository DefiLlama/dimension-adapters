import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchRujiraDailyVolumeUsd, RUJIRA_START_DATE } from "../../helpers/rujira";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const volumeUsd = await fetchRujiraDailyVolumeUsd(options.startOfDay);

  dailyVolume.addUSDValue(volumeUsd);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  // Keep completed UTC-day summaries: intraday summaries do not reconcile to the daily aggregation.
  version: 1,
  chains: [CHAIN.THORCHAIN],
  start: RUJIRA_START_DATE,
  fetch,
  methodology: {
    Volume: "USD value of all Rujira FIN fills, including user orders, virtualized swaps, XYK, and CCL-originated fills.",
  },
};

export default adapter;
