import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const suilendFeesURL = 'https://api.suilend.fi/steamm/daily/fees';

interface DailyStats {  
  protocolFeesUsd: string;
  poolFeesUsd: string;
}

const methodology = {
  Fees: 'Total fees paid from swaps',
  ProtocolReveneue: 'The portion of the total fees going to the STEAMM treasury'
}

const fetchSteammStats = async ({ endTimestamp }: FetchOptions) => {
  const url = `${suilendFeesURL}?ts=${endTimestamp}`
  const stats: DailyStats = (await fetchURL(url));
  return {
    dailyFees: parseFloat(stats.protocolFeesUsd) + parseFloat(stats.poolFeesUsd),
    dailyUserFees: parseFloat(stats.poolFeesUsd),
    dailyRevenue: parseFloat(stats.protocolFeesUsd),
    dailyProtocolRevenue: parseFloat(stats.protocolFeesUsd),
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSteammStats,
      start: '2025-02-16',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
