import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';

const bbscanApiURL = "https://api.bbscan.io/api/fee/stats";

interface DailyStats {
  date: string;
  fee: number;
  timestamp: number;
}

const fetchBounceBitCedefiStats = async ({ startTimestamp }: any) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(startTimestamp * 1000));
  const stats: DailyStats[] = (await fetchURL(bbscanApiURL)).result;

  const dailyFees = stats.find(stat => stat.timestamp === dayTimestamp)?.fee || 0;

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees * 0.3
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BOUNCE_BIT]: {
      runAtCurrTime: false,
      customBackfill: undefined,
      fetch: fetchBounceBitCedefiStats,
      start: "2024-11-11",
    },
  },
};

export default adapter;
