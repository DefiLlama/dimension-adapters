import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

export const SUILEND_API_ENDPOINT = 'https://global.suilend.fi';
const suilendFeesURL = SUILEND_API_ENDPOINT + '/stats/fees';

export const SuiLendMetrics = {
  BorrowInterest: 'SuiLend Borrow Interest',
  BorrowInterestToLenders: 'SuiLend Borrow Interest To Lenders',
  BorrowInterestToTreasury: 'SuiLend Borrow Interest To Treasury',
  StrategiesStakingRewards: 'SuiLend Strategies Staking Rewards',
  StrategiesStakingRewardsToStakers: 'SuiLend Strategies Staking Rewards To Stakers',
  LiquidationFees: 'SuiLend Liquidation Fees',
  LiquidationFeesToLiquidators: 'SuiLend Liquidation Fees To Liquidators',
  LiquidationFeesToTreasury: 'SuiLend Liquidation Fees To Treasury',
  SpringSuiStakingRewards: 'SpringSui Staking Rewards',
  SpringSuiStakingRewardsToStakers: 'SpringSui Staking Rewards To Stakers',
  SpringSuiStakingRewardsToProtocol: 'SpringSui Staking Rewards To Protocol',
  SpringSuiEcosystemStakingRewards: 'SpringSui Ecosystem Staking Rewards',
  SpringSuiEcosystemStakingRewardsToStakers: 'SpringSui Ecosystem Staking Rewards To Stakers',
  SpringSuiEcosystemStakingRewardsToProtocol: 'SpringSui Ecosystem Staking Rewards To Protocol',
  SteammSwapFees: 'STEAMM Swap Fees',
  SteammSwapFeesToLPs: 'STEAMM Swap Fees To LPs',
  SteammSwapFeesToProtocol: 'STEAMM Swap Fees To Protocol',

  TokenBuyBack: 'Token Buy Back',
}

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
  Revenue: 'The portion of the total fees going to the Suilend treasury',
  ProtocolRevenue: 'The portion of the total fees going to the Suilend treasury',
  SupplySideRevenue: "The portion of interest earned by lenders, liquidator bonuses and staking rewards",
  HoldersRevenue: "The portion of treasury are used to buy back SEND",
}

const breakdownMethodology = {
  Fees: {
    [SuiLendMetrics.BorrowInterest]: 'Total interest and fees paid by borrowers',
    [SuiLendMetrics.LiquidationFees]: 'Total liquidation fees and bonus were paid',
    [SuiLendMetrics.StrategiesStakingRewards]: 'Staking rewards from Suilend strategies',
  },
  Revenue: {
    [SuiLendMetrics.BorrowInterestToTreasury]: 'Interest and fees shared to treasury',
    [SuiLendMetrics.LiquidationFeesToTreasury]: 'Liquidation fees and bonus shared to treasury',
  },
  ProtocolRevenue: {
    [SuiLendMetrics.BorrowInterestToTreasury]: 'Interest and fees shared to treasury',
    [SuiLendMetrics.LiquidationFeesToTreasury]: 'Liquidation fees and bonus shared to treasury',
  },
  SupplySideRevenue: {
    [SuiLendMetrics.BorrowInterestToLenders]: 'Interest and fees paid to lenders',
    [SuiLendMetrics.LiquidationFeesToLiquidators]: 'Liquidation fees and bonus were paid to liquidators',
    [SuiLendMetrics.StrategiesStakingRewardsToStakers]: 'Suilend strategies staking rewards to stakers/depositors',
  },
  HoldersRevenue: {
    [SuiLendMetrics.TokenBuyBack]: 'The portion of treasury are used to buy back SEND',
  },
}

const fetchSuilendStats = async ({ endTimestamp, startTimestamp, createBalances, startOfDay }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: DailyStats = (await fetchURL(url));

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()

  dailyFees.addUSDValue(stats.borrowInterestPaid + stats.borrowFees + stats.protocolFees, SuiLendMetrics.BorrowInterest)
  dailyFees.addUSDValue(stats.liquidationProtocolFees + stats.liquidatorBonuses, SuiLendMetrics.LiquidationFees)
  dailyFees.addUSDValue(stats.stakingRevenue, SuiLendMetrics.StrategiesStakingRewards)

  dailyRevenue.addUSDValue(stats.borrowFees + stats.protocolFees, SuiLendMetrics.BorrowInterestToTreasury)
  dailyRevenue.addUSDValue(stats.liquidationProtocolFees, SuiLendMetrics.LiquidationFeesToTreasury)

  dailySupplySideRevenue.addUSDValue(stats.stakingRevenue, SuiLendMetrics.StrategiesStakingRewardsToStakers)
  dailySupplySideRevenue.addUSDValue(stats.borrowInterestPaid, SuiLendMetrics.BorrowInterestToLenders)
  dailySupplySideRevenue.addUSDValue(stats.liquidatorBonuses, SuiLendMetrics.LiquidationFeesToLiquidators)

  const buyBackData = await fetchURL(`${SUILEND_API_ENDPOINT}/send/charts/send?period=all`);
  const buyBackDataItem = buyBackData.find((d: any) => d.timestamp === startOfDay);
  if (buyBackDataItem) {
    dailyHoldersRevenue.addUSDValue(Number(buyBackDataItem.usdValue), SuiLendMetrics.TokenBuyBack);
  }
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
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
