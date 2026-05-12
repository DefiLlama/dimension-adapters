import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import ADDRESSES from '../helpers/coreAssets.json';
import { METRIC } from '../helpers/metrics';

const REFERRAL_VAULT_PROGRAM = 'VAULTkV5rgY9WqZtvaMHvctrKMwQw8bCfSJF4nga2D4';

const CASHBACK_WALLETS = [
  'AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk',
  'AxiomRYAid8ZDhS1bJUAzEaNSr69aTWB9ATfdDLfUbnc',
];
const FEE_WALLETS = [
  '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj',
  '4V65jvcDG9DSQioUVqVPiUcUY9v6sb6HKtMnsxSKEz5S',
  'CeA3sPZfWWToFEBmw5n1Y93tnV66Vmp8LacLzsVprgxZ',
  'AaG6of1gbj1pbDumvbSiTuJhRCRkkUNaWVxijSbWvTJW',
  '7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws',
  '9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP',
  'DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy',
  '4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd',
  '76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf',
  'H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK',
  '8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm',
  '4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz',
  '8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb',
  '86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG',
  'DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM',
  '5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB',
  'DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF',
  'Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9',
  '846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8',
  '5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg',
];

const REFERRAL_PAYOUT_EXCLUDED_ACCOUNTS = [
  REFERRAL_VAULT_PROGRAM,
  'ComputeBudget111111111111111111111111111111',
  ...CASHBACK_WALLETS,
  ...FEE_WALLETS,
];

const CASHBACK_PAYOUT_EXCLUDED_ACCOUNTS = [
  REFERRAL_VAULT_PROGRAM,
  'ComputeBudget111111111111111111111111111111',
  ...CASHBACK_WALLETS,
  ...FEE_WALLETS,
];

const formatAddresses = (addresses: string[]) => addresses.map(address => `'${address}'`).join(', ');
const containsAnyAccount = (addresses: string[]) => addresses.map(address => `CONTAINS(account_keys, '${address}')`).join(' OR ');

// https://dune.com/adam_tehc/axiom
const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const formattedFeeWallets = formatAddresses(FEE_WALLETS);
  const formattedReferralPayoutExcludedAccounts = formatAddresses(REFERRAL_PAYOUT_EXCLUDED_ACCOUNTS);
  const formattedCashbackPayoutExcludedAccounts = formatAddresses(CASHBACK_PAYOUT_EXCLUDED_ACCOUNTS);
  const cashbackWalletFilter = containsAnyAccount(CASHBACK_WALLETS);

  const query = `WITH
    allFeePayments AS (
        SELECT
          tx_id,
          balance_change AS fee_token_amount
        FROM
          solana.account_activity
        WHERE
          TIME_RANGE
          AND tx_success
          AND address IN (
            ${formattedFeeWallets}
          )
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
        AND trades.trader_id NOT IN (
            ${formattedFeeWallets}
          )
      GROUP BY trades.tx_id
    ),
    referral_payout_txs AS (
      SELECT
        id,
        account_keys,
        pre_balances,
        post_balances
      FROM solana.transactions
      WHERE block_date BETWEEN date(from_unixtime(${options.startTimestamp})) AND date(from_unixtime(${options.endTimestamp}))
        AND TIME_RANGE
        AND success = true
        AND CONTAINS(account_keys, '${REFERRAL_VAULT_PROGRAM}')
    ),
    cashback_payout_txs AS (
      SELECT
        id,
        account_keys,
        pre_balances,
        post_balances
      FROM solana.transactions
      WHERE block_date BETWEEN date(from_unixtime(${options.startTimestamp})) AND date(from_unixtime(${options.endTimestamp}))
        AND TIME_RANGE
        AND success = true
        AND (${cashbackWalletFilter})
        AND NOT CONTAINS(account_keys, '${REFERRAL_VAULT_PROGRAM}')
    ),
    referral_payouts AS (
      SELECT
        COALESCE(SUM(post_balances[i] - pre_balances[i]), 0) AS payout_lamports
      FROM referral_payout_txs
      CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
      WHERE post_balances[i] > pre_balances[i]
        AND account_keys[i] NOT IN (${formattedReferralPayoutExcludedAccounts})
    ),
    cashback_payouts AS (
      SELECT
        COALESCE(SUM(post_balances[i] - pre_balances[i]), 0) AS payout_lamports
      FROM cashback_payout_txs
      CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
      WHERE post_balances[i] > pre_balances[i]
        AND account_keys[i] NOT IN (${formattedCashbackPayoutExcludedAccounts})
    )
    SELECT
      (SELECT SUM(fee) FROM botTrades) AS fee,
      (SELECT payout_lamports FROM referral_payouts) AS referral_payout_lamports,
      (SELECT payout_lamports FROM cashback_payouts) AS cashback_payout_lamports
  `;
  const result = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, result[0].fee, METRIC.TRADING_FEES);

  dailyRevenue.add(ADDRESSES.solana.SOL, result[0].fee, 'Trading Fees to protocol');

  const dailyReferralPayouts = options.createBalances();
  dailyReferralPayouts.add(ADDRESSES.solana.SOL, result[0].referral_payout_lamports, 'Referral Payouts');

  const dailyCashbackPayouts = options.createBalances();
  dailyCashbackPayouts.add(ADDRESSES.solana.SOL, result[0].cashback_payout_lamports, 'Cashback Payouts');

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(dailyReferralPayouts);
  dailySupplySideRevenue.addBalances(dailyCashbackPayouts);

  dailyFees.addBalances(dailyReferralPayouts);
  dailyFees.addBalances(dailyCashbackPayouts);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-01-21',
  methodology: {
    Fees: 'Gross Axiom trading fees paid by users plus claimed referral and cashback payouts not captured by Axiom fee wallets.',
    Revenue: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    UserFees: 'Gross Axiom trading fees paid by users plus claimed referral and cashback payouts not captured by Axiom fee wallets.',
    ProtocolRevenue: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    SupplySideRevenue: 'Claimed SOL referral payouts sent to users from Axiom referral vaults and cashback payouts sent to users from Axiom cashback wallets.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Fee paid by users on each trade routed through Axiom (0.75%-1%)',
      'Referral Payouts': 'Claimed SOL referral payouts from Axiom referral vaults.',
      'Cashback Payouts': 'Claimed SOL cashback payouts from Axiom cashback wallets.',
    },
    Revenue: {
      ['Trading Fees to protocol']: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    },
    ProtocolRevenue: {
      ['Trading Fees to protocol']: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    },
    SupplySideRevenue: {
      'Referral Payouts': 'Claimed SOL referral payouts sent to users from Axiom referral vaults.',
      'Cashback Payouts': 'Claimed SOL cashback payouts sent to users from Axiom cashback wallets.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
