import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

export type GrixMetricsData = {
  totalNotionalVolume24Hr: string;
};


const fetchGrix = async (_a: any, _b: any, { endTimestamp}: FetchOptions) => {
  /** Timestamp representing the end of the 24 hour period */
  const url = `https://internal-api-dev.grix.finance/volumeData?endTimestamp=${endTimestamp}`;

  const grixMetricsResponse = await httpGet(url);
  const grixMetricsData = parseGrixMetricsData(grixMetricsResponse);

  if (!grixMetricsData) {
    throw new Error("No data found when fetching Grix volume data");
  }

  const dailyNotionalVolume = Number(grixMetricsData.totalNotionalVolume24Hr);

  return {
    dailyNotionalVolume,
  };
};

const parseGrixMetricsData = (result: any): GrixMetricsData | null => {
  if (typeof result === "object" && result !== null) {
    return result as GrixMetricsData;
  }
  return result ? (JSON.parse(result) as GrixMetricsData) : null;
};

const grix_adapter: SimpleAdapter = {
  version: 1,
  fetch: fetchGrix,
  runAtCurrTime: true, // currently we don't take the timestamp into account, should be changed soon
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-11-01",
    },
  },
};

export default grix_adapter;
