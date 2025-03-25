import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dateString = formatDate(timestamp);
  const data = await fetchURL(
    `https://analytics.mosaic.ag/report/volume?fromDate=${dateString}&toDate=${dateString}`
  );
  const volumeData = data.data;
  if (!volumeData) throw new Error(`Fail to query volume report`);

  return {
    dailyVolume: volumeData.volumeByDate[0]?.volume,
    totalVolume: volumeData.totalVolume,
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
