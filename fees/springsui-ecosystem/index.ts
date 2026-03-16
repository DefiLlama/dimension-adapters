import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SuiLendMetrics } from "../suilend";

interface FeeStats {
  ecosystemFeesUsd: string;
  ecosystemStakerRevenue: string;
}

const fetch = async (options: FetchOptions) => {
  const suilendFeesURL = 'https://global.suilend.fi/springsui/stats/fees';
  const url = `${suilendFeesURL}?endTimestamp=${options.endTimestamp}&startTimestamp=${options.startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  
  const stakerFees = Number(stats.ecosystemStakerRevenue);
  const protocolRevenue = Number(stats.ecosystemFeesUsd);
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(stakerFees + protocolRevenue, SuiLendMetrics.SpringSuiEcosystemStakingRewards)  
  dailySupplySideRevenue.addUSDValue(stakerFees, SuiLendMetrics.SpringSuiEcosystemStakingRewardsToStakers)  
  dailyRevenue.addUSDValue(protocolRevenue, SuiLendMetrics.SpringSuiEcosystemStakingRewardsToProtocol)  

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyFees,
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
    Fees: 'Fees paid by those minting and redeeming SpringSui Ecosystem LSTs + staking rewards',
    Revenue: 'Fees are collected by SpringSui Ecosystem.',
    ProtocolRevenue: 'Fees are collected by SpringSui Ecosystem.',
    SupplySideRevenue: 'Staking rewards to stakers'
  },
  breakdownMethodology: {
    Fees: {
      [SuiLendMetrics.SpringSuiEcosystemStakingRewards]: 'Fees paid by those minting and redeeming SpringSui Ecosystem LSTs + staking rewards',
    },
    Revenue: {
      [SuiLendMetrics.SpringSuiEcosystemStakingRewardsToProtocol]: 'Fees are collected by SpringSui Ecosystem.',
    },
    SupplySideRevenue: {
      [SuiLendMetrics.SpringSuiEcosystemStakingRewardsToStakers]: 'Fees are collected by stakers.',
    },
  },
};

export default adapter;