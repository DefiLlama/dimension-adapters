import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://api.thetis.market/indexer/v1/stats/volume-daily";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const data = await fetchURL(endpoint);

  let dailyVolume = 0;
  for (const item of data) {
    if (item.time == startTime) {
      dailyVolume += ((item.total - item.swap) / 1e18);
    }
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  deadFrom: '2025-09-09',
  chains: [CHAIN.APTOS],
  start: "2024-08-09",
};

export default adapter;
