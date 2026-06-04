import ADDRESSES from '../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Labels for breakdownMethodology compliance.
const LABELS = {
  TERMINAL_FEES: 'Trojan Terminal Trading Fees',
  TERMINAL_REVENUE: 'Trojan Terminal Fees To Protocol',
} as const;

// Trojan Terminal fee wallets (website terminal product). Pure inflow — these
// wallets only receive per-trade fees and have no observed outflows, so all
// fees are retained as revenue. Following the team's official query, every
// positive balance_change is treated as a fee.
const TROJAN_TERMINAL_FEE_WALLETS = [
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
];

const formatAddresses = (addresses: string[]) =>
  addresses.map(a => `'${a}'`).join(', ');

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const terminalFeeWalletsSql = formatAddresses(TROJAN_TERMINAL_FEE_WALLETS);

  // block_date is the partition key on both tables; filtering on it (alongside
  // the block_time TIME_RANGE) prunes partitions and keeps the query from
  // timing out.
  const dateRange = `block_date BETWEEN date(from_unixtime(${options.startTimestamp})) AND date(from_unixtime(${options.endTimestamp}))`;

  // SOL fees come in as native balance_change on the fee wallets; USDC fees
  // arrive as SPL transfers into the wallets' token accounts (tracked by
  // tokens_solana.transfers via to_owner).
  const query = `
    SELECT
      (SELECT COALESCE(SUM(balance_change), 0)
         FROM solana.account_activity
        WHERE ${dateRange}
          AND TIME_RANGE
          AND tx_success
          AND address IN (${terminalFeeWalletsSql})
          AND token_mint_address IS NULL
          AND balance_change > 0) AS fee_lamports,
      (SELECT COALESCE(SUM(amount), 0)
         FROM tokens_solana.transfers
        WHERE ${dateRange}
          AND TIME_RANGE
          AND action = 'transfer'
          AND token_mint_address = '${ADDRESSES.solana.USDC}'
          AND to_owner IN (${terminalFeeWalletsSql})) AS fee_usdc
  `;

  const [row] = await queryDuneSql(options, query);
  const feeSol = Number(row?.fee_lamports ?? 0);
  const feeUsdc = Number(row?.fee_usdc ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, feeSol, LABELS.TERMINAL_FEES);
  dailyFees.add(ADDRESSES.solana.USDC, feeUsdc, LABELS.TERMINAL_FEES);

  // Terminal wallets have no outflows, so all fees are retained as revenue.
  const dailyRevenue = options.createBalances();
  dailyRevenue.add(ADDRESSES.solana.SOL, feeSol, LABELS.TERMINAL_REVENUE);
  dailyRevenue.add(ADDRESSES.solana.USDC, feeUsdc, LABELS.TERMINAL_REVENUE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-13',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'Per-trade fees collected by the Trojan Terminal fee wallets on DEX swaps, in SOL and USDC.',
    Revenue: 'All Terminal fees are retained by Trojan (no cashback / referral payouts).',
    ProtocolRevenue: 'Same as Revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TERMINAL_FEES]: 'Trading fees from the Trojan Terminal.',
    },
    Revenue: {
      [LABELS.TERMINAL_REVENUE]: 'Terminal fees retained by Trojan.',
    },
    ProtocolRevenue: {
      [LABELS.TERMINAL_REVENUE]: 'Terminal fees retained by Trojan.',
    },
  },
};

export default adapter;
