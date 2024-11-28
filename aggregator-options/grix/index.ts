import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

export type GrixMetricsData = {
  totalNotionalVolume: string;
  totalNotionalVolume24Hr: string;
};


const fetchGrix = async ({ endTimestamp}: FetchOptions) => {
  /** Timestamp representing the end of the 24 hour period */
  const url = `https://internal-api-dev.grix.finance/volumeData?endTimestamp=${endTimestamp}`;

  const grixMetricsResponse = await httpGet(url);
  const grixMetricsData = parseGrixMetricsData(grixMetricsResponse);

  if (!grixMetricsData) {
    throw new Error("No data found when fetching Grix volume data");
  }

  const totalNotionalVolume = Number(grixMetricsData.totalNotionalVolume);
  const dailyNotionalVolume = Number(grixMetricsData.totalNotionalVolume24Hr);

  return {
    totalNotionalVolume,
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
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchGrix,
      start: "2024-11-01",
      runAtCurrTime: true, // currently we don't take the timestamp into account, should be changed soon
      meta: {
        methodology:
          "The total value of the underlying assets for all options traded. It is calculated as the spot price (at the trade instance) multiplied by the contract size.",
      },
    },
  },
};

export default grix_adapter;
