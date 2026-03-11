import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';

const bbscanApiURL = "https://api-portal.bouncebit.io/api/fee/stats";

interface DailyStats {
  date: string;
  fee: number;
  timestamp: number;
}

const fetchBounceBitCedefiStats = async (timestamp: any) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const stats: DailyStats[] = (await fetchURL(bbscanApiURL)).result;

  const dailyFees = (() => {
    const idx = stats.findIndex(stat => stat.timestamp === dayTimestamp);
    if (idx === -1) return 0;
    if (idx === 0) return stats[0]?.fee || 0;
    return (stats[idx]?.fee || 0) - (stats[idx - 1]?.fee || 0)
  })();

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees * 0.3,
    dailyProtocolRevenue: dailyFees * 0.3,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BOUNCE_BIT]: {
      fetch: fetchBounceBitCedefiStats,
      start: "2024-11-11",
    },
  },
  methodology: {
    Fees: 'All yields are generated via delta-neutral basis trading on centralized exchanges.',
    Revenue: '30% yields are collected by BounceBit as revenue.',
    ProtocolRevenue: '30% yields are collected by BounceBit as revenue.',
  }
};

export default adapter;
