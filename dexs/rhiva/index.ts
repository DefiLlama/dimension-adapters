import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

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

  const { volume } = await postURL(RHIVA_ENDPOINT, filter, 3);
  const dailyVolume = createBalances();
  dailyVolume.addUSDValue(volume);

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-09-11",
  fetch,
  pullHourly: true,
  methodology: {
    Volume: "Volume traded on Rhiva DEX",
  }
}

export default adapter;