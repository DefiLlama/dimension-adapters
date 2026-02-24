import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
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
  UserFees: 'Interest and fees paid by borrowers and the liquidated',
  Revenue: 'The portion of the total fees going to the Suilend treasury',
  ProtocolRevenue: 'The portion of the total fees going to the Suilend treasury',
  SupplySideRevenue: "The portion of interest earned by lenders, liquidator bonuses and staking rewards"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest and fees paid by borrowers',
    [METRIC.LIQUIDATION_FEES]: 'Total liquidation fees and bonus were paid',
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: 'Interest and fees paid by borrowers',
    [METRIC.LIQUIDATION_FEES]: 'Total liquidation fees and bonus were paid',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'The portion of the total fees going to the Suilend treasury',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees going to the Suilend treasury',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'The portion of the total fees going to the Suilend treasury',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees going to the Suilend treasury',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'The portion of the total fees going to lenders',
    [METRIC.LIQUIDATION_FEES]: 'Liquidator bonuses',
    [METRIC.STAKING_REWARDS]: 'Staking rewards from Suilend strategies',
  },
}

const fetchSuilendStats = async ({ endTimestamp, startTimestamp, createBalances }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: DailyStats = (await fetchURL(url));

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  dailyFees.addUSDValue(stats.borrowInterestPaid + stats.borrowFees + stats.protocolFees, METRIC.BORROW_INTEREST)
  dailyFees.addUSDValue(stats.liquidationProtocolFees + stats.liquidatorBonuses, METRIC.LIQUIDATION_FEES)
  dailyFees.addUSDValue(stats.stakingRevenue, METRIC.STAKING_REWARDS)

  dailyRevenue.addUSDValue(stats.borrowFees + stats.protocolFees, METRIC.BORROW_INTEREST)
  dailyRevenue.addUSDValue(stats.liquidationProtocolFees, METRIC.LIQUIDATION_FEES)

  dailySupplySideRevenue.addUSDValue(stats.stakingRevenue, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addUSDValue(stats.borrowInterestPaid, METRIC.BORROW_INTEREST)
  dailySupplySideRevenue.addUSDValue(stats.liquidatorBonuses, METRIC.LIQUIDATION_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
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
  breakdownMethodology
};

export default adapter;
