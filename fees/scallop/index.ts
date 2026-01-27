import {
  Adapter,
  FetchResultFees,
  FetchResultV2,
  FetchV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const scallopApiURL = 'https://sui.apis.scallop.io/statistic/daily-fees';

interface DailyStats {
  borrowingInterestFee: number,
  liquidationFee: number,
  borrowingFee: number,
  flashloanFee: number,
  liquidityProviderInterest: number,
  dateHistory: string;
}

const methodology = {
  Fees: 'Interest and fees paid by borrowers and the liquidated',
  UserFees: 'Interest and fees paid by borrowers and the liquidated',
  ProtocolRevenue: 'The portion of the total fees going to the Scallop treasury',
  SupplySideRevenue: '80% of all collected borrowing interest fees go to liquidity providers.'
}

const fetchScallopStats: FetchV2 = async ({ startTimestamp, endTimestamp }): Promise<FetchResultV2> => {
  const url = `${scallopApiURL}?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`
  const stats: DailyStats = await fetchURL(url);

  const dailyFees = stats.borrowingInterestFee +
    stats.liquidationFee +
    stats.borrowingFee +
    stats.flashloanFee +
    stats.liquidityProviderInterest;

  const dailyRevenue = stats.liquidationFee +
    stats.borrowingFee +
    stats.flashloanFee +
    stats.borrowingInterestFee;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: stats.liquidityProviderInterest,
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchScallopStats,
      start: '2023-12-31',
    },
  },
  methodology,
};

export default adapter;
