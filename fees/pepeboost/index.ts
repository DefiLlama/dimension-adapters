import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/queries/4022970/6772481

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Labelled as "Pepe Boost Fees" on Solscan.
const FEE_WALLET = 'G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp';
// Found via on-chain research; this is not an official team-provided address.
// Rewards are distributed daily at 00:00 UTC according to docs.
const REWARD_RELAYER = 'BXhkDUR2MCA6wPrnmUN1q2PHLqf973E5L3aqXzouojQE';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = '${FEE_WALLET}'
        AND tx_success
        AND balance_change > 0 
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id != '${FEE_WALLET}'
      GROUP BY trades.tx_id
    ),
    rewardPayouts AS (
      SELECT
        COALESCE(SUM(amount), 0) AS rewards
      FROM
        tokens_solana.transfers
      WHERE
        -- Rewards are distributed daily at 00:00 UTC; use a 15 minute buffer to count outbound SOL payouts from the relayer.
        block_time >= from_unixtime(${options.startOfDay - 15 * 60})
        AND block_time < from_unixtime(${options.startOfDay + 15 * 60})
        AND action = 'transfer'
        AND token_mint_address = 'So11111111111111111111111111111111111111111'
        AND from_owner = '${REWARD_RELAYER}'
        AND to_owner <> '${REWARD_RELAYER}'
        AND to_owner <> '${FEE_WALLET}'
    )
    SELECT
      (SELECT SUM(fee) FROM botTrades) AS fee,
      (SELECT rewards FROM rewardPayouts) AS rewards
  `;

  const fees = await queryDuneSql(options, query);
  const totalFees = Number(fees[0].fee);
  const rewards = Number(fees[0].rewards);
  dailyFees.add(ADDRESSES.solana.SOL, totalFees, METRIC.TRADING_FEES);
  dailyUserFees.add(ADDRESSES.solana.SOL, totalFees, METRIC.TRADING_FEES);
  dailyRevenue.add(ADDRESSES.solana.SOL, totalFees - rewards, 'Trading Fees To Protocol');
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, rewards, 'Referral/Cashback Payouts');

  return { dailyFees, dailyUserFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Trading fees paid by users while using PepeBoost bot.",
  UserFees: "Trading fees paid by users while using PepeBoost bot.",
  Revenue: "Trading fees kept by PepeBoost protocol after referral/cashback payouts.",
  SupplySideRevenue: "Referral/cashback payouts distributed from the PepeBoost reward relayer.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using PepeBoost bot.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using PepeBoost bot.",
  },
  Revenue: {
    'Trading Fees To Protocol': "Trading fees kept by PepeBoost protocol after referral/cashback payouts.",
  },
  SupplySideRevenue: {
    'Referral/Cashback Payouts': "Referral/cashback payouts distributed from the PepeBoost reward relayer.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2024-01-06',
  isExpensiveAdapter: true,
  allowNegativeValue: true, // Referral/cashback payouts can exceed same-day trading fees.
  methodology,
  breakdownMethodology,
};

export default adapter;
