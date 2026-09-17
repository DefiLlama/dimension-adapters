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
}

const fetchSuilendStats = async ({ endTimestamp, startTimestamp, createBalances }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: DailyStats = (await fetchURL(url));

  // `protocolFees` is the spread fee the protocol keeps out of the interest
  // borrowers pay, so it is already inside `borrowInterestPaid` rather than
  // charged on top of it. On-chain the reserve emits the two from one figure:
  // `borrow_interest_paid: net_new_debt` and `spread_fee`, with the lenders'
  // share as `supply_interest_earned: net_new_debt - spread_fee`. Adding it to
  // total fees counts it twice, and paying lenders the full
  // `borrowInterestPaid` credits them the protocol's cut.
  const lenderInterest = stats.borrowInterestPaid - stats.protocolFees;

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  dailyFees.addUSDValue(stats.borrowInterestPaid + stats.borrowFees, SuiLendMetrics.BorrowInterest)
  dailyFees.addUSDValue(stats.liquidationProtocolFees + stats.liquidatorBonuses, SuiLendMetrics.LiquidationFees)
  dailyFees.addUSDValue(stats.stakingRevenue, SuiLendMetrics.StrategiesStakingRewards)

  dailyRevenue.addUSDValue(stats.borrowFees + stats.protocolFees, SuiLendMetrics.BorrowInterestToTreasury)
  dailyRevenue.addUSDValue(stats.liquidationProtocolFees, SuiLendMetrics.LiquidationFeesToTreasury)

  dailySupplySideRevenue.addUSDValue(stats.stakingRevenue, SuiLendMetrics.StrategiesStakingRewardsToStakers)
  dailySupplySideRevenue.addUSDValue(lenderInterest, SuiLendMetrics.BorrowInterestToLenders)
  dailySupplySideRevenue.addUSDValue(stats.liquidatorBonuses, SuiLendMetrics.LiquidationFeesToLiquidators)

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
      fetch: fetchSuilendStats,
      start: '2024-03-01',
    },
  },
  methodology,
  breakdownMethodology
};

export default adapter;
