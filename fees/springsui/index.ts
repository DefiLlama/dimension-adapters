import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SUILEND_API_ENDPOINT, SuiLendMetrics } from "../suilend";

interface FeeStats {
  springSuiFeesUsd: string;
  springSuiStakerRevenue: string;
}

const fetch = async (options: FetchOptions) => {
  const suilendFeesURL = SUILEND_API_ENDPOINT + '/springsui/stats/fees';
  const url = `${suilendFeesURL}?endTimestamp=${options.endTimestamp}&startTimestamp=${options.startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  
  const stakerRevenue = Number(stats.springSuiStakerRevenue);
  const protocolRevenue = Number(stats.springSuiFeesUsd);
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(stakerRevenue + protocolRevenue, SuiLendMetrics.SpringSuiStakingRewards)  
  dailySupplySideRevenue.addUSDValue(stakerRevenue, SuiLendMetrics.SpringSuiStakingRewardsToStakers)  
  dailyRevenue.addUSDValue(protocolRevenue, SuiLendMetrics.SpringSuiStakingRewardsToProtocol)  

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2024-10-29',
    },
  },
  methodology: {
    Fees: 'Fees paid by those minting and redeeming SpringSui + staking rewards.',
    Revenue: 'Fees are collected by SpringSui.',
    ProtocolRevenue: 'Fees are collected by SpringSui.',
    SupplySideRevenue: 'The staking rewards earned by sSUI stakers'
  },
  breakdownMethodology: {
    Fees: {
      [SuiLendMetrics.SpringSuiStakingRewards]: 'Fees paid by those minting and redeeming SpringSui + staking rewards',
    },
    Revenue: {
      [SuiLendMetrics.SpringSuiStakingRewardsToProtocol]: 'Fees are collected by SpringSui.',
    },
    SupplySideRevenue: {
      [SuiLendMetrics.SpringSuiStakingRewardsToStakers]: 'The staking rewards earned by sSUI stakers',
    },
  }
};

export default adapter;