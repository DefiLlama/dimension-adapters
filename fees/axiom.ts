import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';
import { queryDuneSql } from '../helpers/dune';

const LABELS = {
  TRADING_FEES: 'Trading Fees',
  TRADING_FEES_TO_PROTOCOL: 'Trading Fees to protocol',
  REFERRAL_PAYOUTS: 'Referral Payouts',
  CASHBACK_PAYOUTS: 'Cashback Payouts',
} as const;


const chainConfig = {
  [CHAIN.SOLANA]: {
    start: '2025-01-21',
    referralVaultProgram: 'VAULTkV5rgY9WqZtvaMHvctrKMwQw8bCfSJF4nga2D4',
    cashbackWallets: [
      'AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk',
      'AxiomRYAid8ZDhS1bJUAzEaNSr69aTWB9ATfdDLfUbnc',
    ],
    feeWallets: [
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
    ],
  },
  [CHAIN.BSC]: {
    start: '2026-01-25',
    tradeContract: '0x325098a6291a412bba7a52531ef05ac5dd7d5d6e',
    feeReceiver: '0xdec29d79e8cdf009d2fa33e0558cb5648481cac3',
    supplySideExcludedReceiver: '0x43d2a6763fcdb002328c2754a2bad82ec24b35fc',
  },
} as const;

const formatAddresses = (addresses: readonly string[]) => addresses.map((address) => `'${address}'`).join(', ');
const containsAnyAccount = (addresses: readonly string[]) => addresses.map((address) => `CONTAINS(account_keys, '${address}')`).join(' OR ');

async function fetchSolana(options: FetchOptions) {
  const solanaConfig = chainConfig[CHAIN.SOLANA];
  const REFERRAL_PAYOUT_EXCLUDED_ACCOUNTS = [
    solanaConfig.referralVaultProgram,
    'ComputeBudget111111111111111111111111111111',
    ...solanaConfig.cashbackWallets,
    ...solanaConfig.feeWallets,
  ];

  const CASHBACK_PAYOUT_EXCLUDED_ACCOUNTS = [
    solanaConfig.referralVaultProgram,
    'ComputeBudget111111111111111111111111111111',
    ...solanaConfig.cashbackWallets,
    ...solanaConfig.feeWallets,
  ];

  const formattedFeeWallets = formatAddresses(solanaConfig.feeWallets);
  const formattedReferralPayoutExcludedAccounts = formatAddresses(REFERRAL_PAYOUT_EXCLUDED_ACCOUNTS);
  const formattedCashbackPayoutExcludedAccounts = formatAddresses(CASHBACK_PAYOUT_EXCLUDED_ACCOUNTS);
  const cashbackWalletFilter = containsAnyAccount(solanaConfig.cashbackWallets);

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
        AND CONTAINS(account_keys, '${solanaConfig.referralVaultProgram}')
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
        AND NOT CONTAINS(account_keys, '${solanaConfig.referralVaultProgram}')
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
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, result[0].fee, LABELS.TRADING_FEES);
  dailyFees.add(ADDRESSES.solana.SOL, result[0].referral_payout_lamports, LABELS.TRADING_FEES);
  dailyFees.add(ADDRESSES.solana.SOL, result[0].cashback_payout_lamports, LABELS.TRADING_FEES);

  dailyRevenue.add(ADDRESSES.solana.SOL, result[0].fee, LABELS.TRADING_FEES_TO_PROTOCOL);

  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, result[0].referral_payout_lamports, LABELS.REFERRAL_PAYOUTS);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, result[0].cashback_payout_lamports, LABELS.CASHBACK_PAYOUTS);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}


async function fetchBsc(options: FetchOptions) {
  const bscConfig = chainConfig[CHAIN.BSC];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [{ fees_amount, supply_side_amount }] = await queryDuneSql(options, `
    SELECT
      COALESCE(SUM(CASE
        WHEN "from" = ${bscConfig.tradeContract}
         AND "to" = ${bscConfig.feeReceiver}
        THEN value
        ELSE 0
      END), 0) AS fees_amount,
      COALESCE(SUM(CASE
        WHEN "from" = ${bscConfig.feeReceiver}
         AND "to" <> ${bscConfig.supplySideExcludedReceiver}
        THEN value
        ELSE 0
      END), 0) AS supply_side_amount
    FROM bnb.traces
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND success = true
      AND value > 0
      AND (
        ("from" = ${bscConfig.tradeContract} AND "to" = ${bscConfig.feeReceiver})
        OR
        ("from" = ${bscConfig.feeReceiver} AND "to" <> ${bscConfig.supplySideExcludedReceiver})
      )
  `);

  dailyFees.addGasToken(fees_amount, LABELS.TRADING_FEES);
  dailyFees.addGasToken(supply_side_amount, LABELS.TRADING_FEES);
  dailySupplySideRevenue.addGasToken(supply_side_amount, LABELS.CASHBACK_PAYOUTS);
  dailyRevenue.addGasToken(fees_amount, LABELS.TRADING_FEES_TO_PROTOCOL);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const fetch: any = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchBsc(options);
}


const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  allowNegativeValue: true, //claims may happen at later date
  fetch,
  methodology: {
    Fees: 'Includes all trading fees paid by Axiom users.',
    Revenue: 'Revenue is fees retained by Axiom after deducting referral and cashback payouts.',
    ProtocolRevenue: 'Protocol revenue is the portion of fees retained by Axiom after deducting referral and cashback payouts.',
    SupplySideRevenue: 'Claimed SOL cashback/referral payouts from Axiom cashback wallets, plus native BNB cashback/referral payouts sent out from the BNB Chain fee receiver.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TRADING_FEES]: 'Trading fees paid by Axiom users.',
    },
    Revenue: {
      [LABELS.TRADING_FEES_TO_PROTOCOL]: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    },
    ProtocolRevenue: {
      [LABELS.TRADING_FEES_TO_PROTOCOL]: 'Trading fees going to the protocol after deducting referral and cashback payouts.',
    },
    SupplySideRevenue: {
      [LABELS.REFERRAL_PAYOUTS]: 'Claimed SOL referral payouts sent to users from Axiom referral vaults.',
      [LABELS.CASHBACK_PAYOUTS]: 'Claimed SOL cashback payouts from Axiom cashback wallets, plus native BNB cashback/referral payouts sent out from the BNB Chain fee receiver.',
    },
  },
  adapter: chainConfig,
  isExpensiveAdapter: true,
};

export default adapter;
