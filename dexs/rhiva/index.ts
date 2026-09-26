import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const RHIVA_ENDPOINT = "https://api.rhiva.fun/metrics/dex";

async function fetch({
  toTimestamp,
  fromTimestamp,
  createBalances,
}: FetchOptions) {
  const filter = {
    filter: {
      endTime: new Date(toTimestamp * 1000).toISOString(),
      startTime: new Date(fromTimestamp * 1000).toISOString(),
    },
  };

  const { volume } = await httpPost(RHIVA_ENDPOINT, filter);
  const dailyVolume = createBalances();
  dailyVolume.addUSDValue(volume);

  return { dailyVolume };
}

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-09-11",
      runAtCurrTime: true,
    },
  },
};
