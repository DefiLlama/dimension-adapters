import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const bbscanApiURL = "https://api-portal.bouncebit.io/api/fee/stats";

interface DailyStats {
  date: string;
  fee: number;
  timestamp: number;
}

const fetch = async (options: FetchOptions) => {
  const stats: DailyStats[] = (await fetchURL(bbscanApiURL)).result;

  const dailyFees = (() => {
    const idx = stats.findIndex(stat => stat.timestamp === options.startOfDay);
    if (idx === -1) return 0;
    if (idx === 0) return stats[0]?.fee || 0;
    return (stats[idx]?.fee || 0) - (stats[idx - 1]?.fee || 0)
  })();

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * 0.3,
    dailyProtocolRevenue: dailyFees * 0.3,
    dailySupplySideRevenue: dailyFees * 0.7,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BOUNCE_BIT],
  start: "2024-11-11",
  methodology: {
    Fees: 'All yields are generated via delta-neutral basis trading on centralized exchanges.',
    UserFees: 'Yields are generated on behalf of depositors via delta-neutral basis trading.',
    Revenue: '30% of yields are collected by BounceBit as revenue.',
    ProtocolRevenue: '30% of yields are collected by BounceBit as revenue.',
    SupplySideRevenue: '70% of yields are distributed to depositors.',
  }
};

export default adapter;
