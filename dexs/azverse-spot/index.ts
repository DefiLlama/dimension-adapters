import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getAzverseDailyStats } from "../../helpers/azverse";

const fetch = async (options: FetchOptions) => {
  const { volume } = await getAzverseDailyStats(options.dateString, "spot");
  return { dailyVolume: volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-12-31",
  methodology: {
    Volume: "USD spot trading volume on AZverse, excluding perpetual markets.",
  },
};

export default adapter;
