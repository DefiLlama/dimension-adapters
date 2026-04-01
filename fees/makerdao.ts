/*
Data sources:
- https://info.sky.money/revenue
- https://info.sky.money/buyback

check against:
- https://makerburn.com/#/
*/

import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { DAY } from "../utils/date";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

const METRICS = {
  BorrowInterest: 'Loans Stability Fees',
  TokenBuyBack: METRIC.TOKEN_BUY_BACK,
  PSMFees: 'Peg Stability Module Fees',
  LiquidationFees: 'Liquidation Fees',
  SavingRateCost: 'Saving Module Cost (DSM)',
  StakingRewards: 'USDS Staking Rewards',
}

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const revenue_data = await fetchURL(`https://info-sky.blockanalitica.com/api/v1/revenue/historic/?start_date=${getDay(options.startTimestamp - 3 * DAY)}&end_date=${getDay(options.endTimestamp + 3 * DAY)}`)
  const buyback_data = await fetchURL(`https://info-sky.blockanalitica.com/buyback/historic/?days_ago=9999&format=json`)

  const staking_rewards_data = await fetchURL(`https://info-sky.blockanalitica.com/farms/0x38e4254bd82ed5ee97cd1c4278faae748d998865/historic/?days_ago=9999`)

  const dayData = revenue_data.find((d: any) => d.date == getDay(options.startOfDay))
  const buybackDayData = buyback_data.bar.find((d: any) => d.date == getDay(options.startOfDay))

  const prevDay = getDay(options.startOfDay - DAY)
  const stakingRewardsDayData = staking_rewards_data.find((d: any) => d.date == getDay(options.startOfDay))
  const stakingRewardsPrevDayData = staking_rewards_data.find((d: any) => d.date == prevDay)
  let staking_reward_amount = 0
  if (stakingRewardsDayData && stakingRewardsPrevDayData) {
    staking_reward_amount = Number(stakingRewardsDayData.total_farmed) - Number(stakingRewardsPrevDayData.total_farmed)
  }
  
  dailyFees.addUSDValue(Number(dayData.stability_fee || 0) / 365, METRICS.BorrowInterest);
  dailyFees.addUSDValue(Number(dayData.liquidation_income || 0) / 365, METRICS.LiquidationFees);
  dailyFees.addUSDValue(Number(dayData.psm_fees || 0) / 365, METRICS.PSMFees);
  
  dailySupplySideRevenue.addUSDValue(Number(dayData.savings_rate_cost || 0) / 365, METRICS.SavingRateCost);
  
  dailyRevenue.addUSDValue(Number(dayData.liquidation_income || 0) / 365, METRICS.LiquidationFees);
  dailyRevenue.addUSDValue(Number(dayData.psm_fees || 0) / 365, METRICS.PSMFees);
  dailyRevenue.addUSDValue(Number(dayData.stability_fee || 0) / 365 - Number(dayData.savings_rate_cost || 0) / 365, METRICS.BorrowInterest);
  
  if (buybackDayData) {
    dailyHoldersRevenue.addCGToken('sky', Number(buybackDayData.sky_buyback_24h), METRICS.TokenBuyBack);
  }

  if (stakingRewardsDayData) {
    dailyHoldersRevenue.addCGToken('usds', Number(staking_reward_amount), METRICS.StakingRewards);
  }
  
  const revenueUsd = await dailyRevenue.getUSDValue()
  const holdersRevenueUsd = await dailyHoldersRevenue.getUSDValue()
  dailyProtocolRevenue.addUSDValue(revenueUsd - holdersRevenueUsd)
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};


const adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2019-11-13',
    },
  },
  methodology: {
    Fees: "Stability fees charged on DAI/USDS loans, liquidation income from collateral auctions, and PSM (Peg Stability Module) fees from USDC/DAI conversions",
    Revenue: "Fees collected minus savings rate paid to DSR depositors",
    HoldersRevenue: "SKY token buybacks + staking rewards for sky stakers",
    ProtocolRevenue: "Net protocol revenue after subtracting SKY token buybacks",
    SupplySideRevenue: "DAI/USDS paid to DSR depositors",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.BorrowInterest]: 'Stability fees charged on DAI/USDS loans',
      [METRICS.PSMFees]: 'Fees from PSM (Peg Stability Module)',
      [METRICS.LiquidationFees]: 'Fees from liquidations income',
    },
    Revenue: {
      [METRICS.BorrowInterest]: 'Stability fees charged on DAI/USDS loans minus savings rate paid to DSR depositors',
      [METRICS.PSMFees]: 'Fees from PSM (Peg Stability Module)',
      [METRICS.LiquidationFees]: 'Fees from liquidations income',
    },
    SupplySideRevenue: {
      [METRICS.SavingRateCost]: 'Savings rate paid to DSR depositors',
    },
    HoldersRevenue: {
      [METRICS.TokenBuyBack]: 'SKY tokens buy back from revenue',
      [METRICS.StakingRewards]: 'USDS rewards paid to SKY stakers',
    },
  },
  allowNegativeValue: true, // Expenses can be higher than Daily Fees
}

export default adapter;
