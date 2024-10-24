import {
  Adapter,
  FetchResultFees,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const suilendFeesURL = 'https://api.suilend.fi/stats/daily-fees';

interface DailyStats {
  date: string;
  start: number;
  end: number;
  borrowFees: number;
  borrowInterestPaid: number;
  protocolFees: number;
  liquidatorBonuses: number;
  liquidationProtocolFees: number;
  previous: string;
  next: string;
}

const methodology = {
  Fees: 'Interest and fees paid by borrowers and the liquidated',
  ProtocolReveneue: 'The portion of the total fees going to the Suilend treasury'
}

const fetchSuilendStats = async (timestamp: number): Promise<FetchResultFees> => {
  const url = `${suilendFeesURL}?ts=${timestamp}`
  const stats: DailyStats = (await fetchURL(url));

  const userFees =
    stats.borrowInterestPaid +
    stats.borrowFees +
    stats.protocolFees + 
    stats.liquidationProtocolFees;

  const dailyRevenue = stats.borrowInterestPaid +
    stats.liquidationProtocolFees;

  return {
    timestamp,
    dailyFees: userFees,
    dailyUserFees: userFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};



const adapter: Adapter = {
  adapter: {
    [CHAIN.SUI]: {
      runAtCurrTime: false,
      customBackfill: undefined,
      fetch: fetchSuilendStats,
      start: 1709280000,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
