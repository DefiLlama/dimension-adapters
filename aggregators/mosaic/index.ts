import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STATS_BASE_URL = "https://stats.mosaic.ag";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dateString = formatDate(timestamp);
  const dateVolumeData = await fetchURL(
    `${STATS_BASE_URL}/v1/public/volume?from_date=${dateString}&to_date=${dateString}`
  );
  const volumeData = dateVolumeData.data;
  if (!volumeData) throw new Error(`Fail to query volume report`);

  const totalVolumeData = await fetchURL(
    `${STATS_BASE_URL}/v1/public/all_time`
  );

  return {
    dailyVolume: volumeData.data[0]?.volume,
    totalVolume: totalVolumeData.data.data.volume,
    timestamp,
  };
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().split("T")[0];
};

const adapter: any = {
  timetravel: false,
  adapter: {
    [CHAIN.MOVE]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2025-03-10",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
