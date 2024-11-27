import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

export type GrixMetricsData = {
  graphStatistics: {
    uniqueUserCount: string;
    totalNotionalValue: string;
    totalTransactions: string;
  };
};

const fetchGrix = async () => {
  const url = `https://internal-api-dev.grix.finance/grixmetrics`;

  const grixMetricsResponse = await httpGet(url);
  const grixMetricsData = parseGrixMetricsData(grixMetricsResponse);

  const stats = grixMetricsData ? extractStats(grixMetricsData) : null;

  return { totalNotionalVolume: stats?.totalNotionalVolume };
};

const parseGrixMetricsData = (result: any): GrixMetricsData | null => {
  if (typeof result === "object" && result !== null) {
    return result as GrixMetricsData;
  }
  return result ? (JSON.parse(result) as GrixMetricsData) : null;
};

const extractStats = (data: GrixMetricsData) => ({
  totalNotionalVolume: Number(data.graphStatistics.totalNotionalValue),
});

const grix_adapter: SimpleAdapter = {
  version: 1,
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
