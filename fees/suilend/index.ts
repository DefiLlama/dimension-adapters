import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

export const SUILEND_API_ENDPOINT = 'https://api.suilend.fi';
const suilendFeesURL = SUILEND_API_ENDPOINT + '/stats/fees';

export const SuiLendMetrics = {
  BorrowInterest: 'SuiLend Borrow Interest',
  BorrowInterestToLenders: 'SuiLend Borrow Interest To Lenders',
  BorrowInterestToTreasury: 'SuiLend Borrow Interest To Treasury',
  SuiReserveStakingRewards: 'SuiLend SUI Reserve Staking Rewards',
  SuiReserveStakingRewardsToTreasury: 'SuiLend SUI Reserve Staking Rewards To Treasury',
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
  supplyInterestEarned: number;
  liquidatorBonuses: number;
  liquidationProtocolFees: number;
  stakingRevenue: number;
}

const methodology = {
  Fees: "Interest and fees paid by borrowers and the liquidated, plus staking rewards on the SUI reserve's idle SUI",
  Revenue: "The portion of the total fees going to the Suilend treasury, including the SUI reserve's staking rewards",
  ProtocolRevenue: "The portion of the total fees going to the Suilend treasury, including the SUI reserve's staking rewards",
  SupplySideRevenue: "The portion of interest earned by lenders and liquidator bonuses",
  HoldersRevenue: "The portion of treasury are used to buy back SEND",
}

const breakdownMethodology = {
  Fees: {
    [SuiLendMetrics.BorrowInterest]: 'Total interest and fees paid by borrowers',
    [SuiLendMetrics.LiquidationFees]: 'Total liquidation fees and bonus were paid',
    [SuiLendMetrics.SuiReserveStakingRewards]: "Staking rewards on the SUI reserve's idle SUI",
  },
  Revenue: {
    [SuiLendMetrics.BorrowInterestToTreasury]: 'Interest and fees shared to treasury',
    [SuiLendMetrics.LiquidationFeesToTreasury]: 'Liquidation fees and bonus shared to treasury',
    [SuiLendMetrics.SuiReserveStakingRewardsToTreasury]: "SUI reserve staking rewards, claimed into the reserve's protocol fees",
  },
  ProtocolRevenue: {
    [SuiLendMetrics.BorrowInterestToTreasury]: 'Interest and fees shared to treasury',
    [SuiLendMetrics.LiquidationFeesToTreasury]: 'Liquidation fees and bonus shared to treasury',
    [SuiLendMetrics.SuiReserveStakingRewardsToTreasury]: "SUI reserve staking rewards, claimed into the reserve's protocol fees",
  },
  SupplySideRevenue: {
    [SuiLendMetrics.BorrowInterestToLenders]: 'Interest paid to lenders, after the protocol fee',
    [SuiLendMetrics.LiquidationFeesToLiquidators]: 'Liquidation fees and bonus were paid to liquidators',
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

  dailyFees.addUSDValue(stats.borrowInterestPaid + stats.borrowFees, SuiLendMetrics.BorrowInterest)
  dailyFees.addUSDValue(stats.liquidationProtocolFees + stats.liquidatorBonuses, SuiLendMetrics.LiquidationFees)
  dailyFees.addUSDValue(stats.stakingRevenue, SuiLendMetrics.SuiReserveStakingRewards)

  dailyRevenue.addUSDValue(stats.borrowFees + stats.protocolFees, SuiLendMetrics.BorrowInterestToTreasury)
  dailyRevenue.addUSDValue(stats.liquidationProtocolFees, SuiLendMetrics.LiquidationFeesToTreasury)
  dailyRevenue.addUSDValue(stats.stakingRevenue, SuiLendMetrics.SuiReserveStakingRewardsToTreasury)

  dailySupplySideRevenue.addUSDValue(stats.supplyInterestEarned, SuiLendMetrics.BorrowInterestToLenders)
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
