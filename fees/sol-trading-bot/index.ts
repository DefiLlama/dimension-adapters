import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/queries/4962800/8212075

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const FEE_WALLETS = [
  'F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
  'K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5',
  'HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg',
  '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
  'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
  '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
  'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
  'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib',
]

// Found via on-chain research; this reward relayer was not provided by the SolTrading Bot team.
// refsoltradingbot1.sol domain registered and constantly funded by fee wallets.
const REWARD_RELAYER = '9w92rN19VgFBCR8qLvxRkFpQCbHNYxkCN1VH91DT8Uxq';

const LABELS = {
  TRADING_FEES_TO_PROTOCOL: 'Trading Fees To Protocol',
  REFERRAL_CASHBACK_PAYOUTS: 'Referral/Cashback Payouts',
} as const;

const fetch: any = async (options: FetchOptions) => {
  const feeWallets = FEE_WALLETS.map((wallet) => `'${wallet}'`).join(', ');
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change / 1e9 AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND address IN (${feeWallets})
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
        AND trades.trader_id NOT IN (${feeWallets})
      GROUP BY trades.tx_id
    ),
    rewardPayouts AS (
      SELECT
        COALESCE(SUM(amount), 0) AS rewards
      FROM
        tokens_solana.sol_transfers
      WHERE
        TIME_RANGE
        AND action = 'transfer'
        AND from_owner = '${REWARD_RELAYER}'
        AND (to_owner IS NULL OR to_owner NOT IN (${feeWallets}))
        AND (to_owner IS NULL OR to_owner <> '${REWARD_RELAYER}')
    )
    SELECT
      COALESCE((SELECT SUM(fee) FROM botTrades), 0) AS fees,
      (SELECT rewards FROM rewardPayouts) AS rewards
  `;

  const [row] = await queryDuneSql(options, query);
  const totalFees = Number(row?.fees) * 1e9;
  // rewards come from tokens_solana.sol_transfers.amount, which is already in raw lamports - no scaling.
  const rewards = Number(row?.rewards);

  dailyFees.add(ADDRESSES.solana.SOL, totalFees, METRIC.TRADING_FEES);
  dailyRevenue.add(ADDRESSES.solana.SOL, totalFees - rewards, LABELS.TRADING_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, rewards, LABELS.REFERRAL_CASHBACK_PAYOUTS);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Trading fees paid by users while using SolTrading Bot.",
  UserFees: "Trading fees paid by users while using SolTrading Bot.",
  Revenue: "Trading fees kept by SolTrading Bot after referral/cashback payouts.",
  ProtocolRevenue: "Trading fees kept by SolTrading Bot after referral/cashback payouts.",
  SupplySideRevenue: "Outbound transfers from the reward relayer, excluding existing fee wallets.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using SolTrading Bot.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using SolTrading Bot.",
  },
  Revenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees kept by SolTrading Bot after referral/cashback payouts.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees kept by SolTrading Bot after referral/cashback payouts.",
  },
  SupplySideRevenue: {
    [LABELS.REFERRAL_CASHBACK_PAYOUTS]: "Outbound transfers from the reward relayer, excluding existing fee wallets.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-08-15',
  isExpensiveAdapter: true,
  allowNegativeValue: true, // Rewards are claimed by users, claims can be > fee recieved 
  methodology,
  breakdownMethodology,
};

export default adapter;
