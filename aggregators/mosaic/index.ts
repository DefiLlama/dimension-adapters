import { FetchResult } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_: any): Promise<FetchResult> => {
  const unixTimestamp = getUniqStartOfTodayTimestamp();
  const data = await fetchURLWithRetry(
    `https://analytics.mosaic.ag/report/volume`
  );
  const volumeData = data.data;
  if (!volumeData) throw new Error(`Fail to query volume report`);
  return {
    dailyVolume: volumeData.volumeByDate[0]?.volume,
    totalVolume: volumeData.totalVolume,
    timestamp: unixTimestamp,
  };
};

const adapter: any = {
  timetravel: false,
  adapter: {
    [CHAIN.MOVEMENT]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2025-03-10",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
