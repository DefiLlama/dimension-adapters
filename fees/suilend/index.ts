import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const suilendFeesURL = 'https://api.suilend.fi/stats/fees';

interface DailyStats {
  borrowFees: number;
  borrowInterestPaid: number;
  protocolFees: number;
  liquidatorBonuses: number;
  liquidationProtocolFees: number;
  stakingRevenue: number;
}

const methodology = {
  Fees: 'Interest and fees paid by borrowers and the liquidated',
  ProtocolReveneue: 'The portion of the total fees going to the Suilend treasury'
}

const fetchSuilendStats = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: DailyStats = (await fetchURL(url));

  const userFees =
    stats.borrowInterestPaid +
    stats.borrowFees +
    stats.liquidationProtocolFees +
    stats.liquidatorBonuses;

  const dailyRevenue = stats.borrowFees +
    stats.protocolFees +
    stats.liquidationProtocolFees
    + stats.stakingRevenue;

  return {
    dailyFees: userFees,
    dailyUserFees: userFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSuilendStats,
      start: '2024-03-01',
    },
  },
  methodology,
};

export default adapter;
