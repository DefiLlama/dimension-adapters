import ADDRESSES from '../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Labels for breakdownMethodology compliance.

const LABELS = {
  BOT_FEES: 'Trojan Bot Trading Fees',
  TERMINAL_FEES: 'Trojan Terminal Trading Fees',
  BOT_REVENUE: 'Trojan Bot Fees To Protocol',
  TERMINAL_REVENUE: 'Trojan Terminal Fees To Protocol',
  CASHBACK_REFERRAL: 'Trojan Cashback And Referral Payouts',
} as const;

// Bot fee wallet (Telegram bot). Receives per-trade fee inflows AND signs the
// twice-daily cashback + referral payout batches as outflows. Every positive
// native-SOL balance_change is a fee. Outflows are split structurally: cashback
// / referral batches fan out to multiple recipients in a single tx, whereas
// internal treasury sweeps are a single transfer, so only multi-recipient
// outflow txs are counted as cashback (robust to sweep-address rotations).
const TROJAN_BOT_FEE_WALLET = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco';

// Trojan Terminal fee wallets (website / mini-app terminal product). Pure
// inflow — they only receive per-trade fees (in SOL and USDC) and have no
// observed outflows, so all Terminal fees are retained as revenue.
const TROJAN_TERMINAL_FEE_WALLETS = [
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
];

// Known internal treasury sweep destinations. Excluded explicitly as a second
// guard alongside the multi-recipient heuristic. The sweep destination has
// rotated over time: CvdzGdvw... (pre-Feb 2026) and DrXMnPrF... (post-Feb 2026).
const INTERNAL_TREASURY_WALLETS = [
  'DrXMnPrFSiHA4JKKrSktTbAFrfvQCixHKvD7zGHxkzJP',
  'CvdzGdvw9P4eo1wHFCESKqKCtZ3yMaKVydfMJpyKv4pr',
];

const formatAddresses = (addresses: string[]) =>
  addresses.map(a => `'${a}'`).join(', ');

const fetch = async (options: FetchOptions) => {
  const terminalFeeWalletsSql = formatAddresses(TROJAN_TERMINAL_FEE_WALLETS);
  const internalWalletsSql = formatAddresses(INTERNAL_TREASURY_WALLETS);
  // block_date is the partition key on these tables; filtering on it (alongside
  // the block_time TIME_RANGE) prunes partitions and keeps the query from
  // timing out.
  const dateRange = `block_date BETWEEN date(from_unixtime(${options.startTimestamp})) AND date(from_unixtime(${options.endTimestamp}))`;

  const query = `
    WITH
    -- All SOL sent out by the bot wallet to NON-internal recipients, grouped by
    -- tx. Anchored on from_owner so it only touches the bot's transfers (cheap),
    -- and drops transfers into the known internal treasury wallets outright.
    botOutflowTxs AS (
      SELECT tx_id, COUNT(*) AS num_transfers, SUM(amount) AS lamports_out
      FROM tokens_solana.sol_transfers
      WHERE ${dateRange}
        AND TIME_RANGE
        AND from_owner = '${TROJAN_BOT_FEE_WALLET}'
        AND to_owner NOT IN (${internalWalletsSql})
      GROUP BY tx_id
    )
    SELECT
      -- Bot fees: native-SOL inflows to the bot wallet.
      (SELECT COALESCE(SUM(balance_change), 0)
         FROM solana.account_activity
        WHERE ${dateRange}
          AND TIME_RANGE
          AND tx_success
          AND address = '${TROJAN_BOT_FEE_WALLET}'
          AND token_mint_address IS NULL
          AND balance_change > 0) AS bot_fee_lamports,
      -- Terminal fees (SOL): native-SOL inflows to the terminal wallets.
      (SELECT COALESCE(SUM(balance_change), 0)
         FROM solana.account_activity
        WHERE ${dateRange}
          AND TIME_RANGE
          AND tx_success
          AND address IN (${terminalFeeWalletsSql})
          AND token_mint_address IS NULL
          AND balance_change > 0) AS terminal_fee_lamports,
      -- Terminal fees (USDC): SPL transfers into the terminal wallets.
      (SELECT COALESCE(SUM(amount), 0)
         FROM tokens_solana.transfers
        WHERE ${dateRange}
          AND TIME_RANGE
          AND action = 'transfer'
          AND token_mint_address = '${ADDRESSES.solana.USDC}'
          AND to_owner IN (${terminalFeeWalletsSql})) AS terminal_fee_usdc,
      -- Cashback / referral payouts: outflow txs that fan out to 2+ recipients.
      -- Single-transfer outflows are internal treasury sweeps and are excluded.
      (SELECT COALESCE(SUM(lamports_out), 0)
         FROM botOutflowTxs
        WHERE num_transfers >= 2) AS cashback_lamports
  `;

  const [row] = await queryDuneSql(options, query);
  const botFee = Number(row?.bot_fee_lamports ?? 0);
  const terminalFeeSol = Number(row?.terminal_fee_lamports ?? 0);
  const terminalFeeUsdc = Number(row?.terminal_fee_usdc ?? 0);
  const cashback = Number(row?.cashback_lamports ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, botFee, LABELS.BOT_FEES);
  dailyFees.add(ADDRESSES.solana.SOL, terminalFeeSol, LABELS.TERMINAL_FEES);
  dailyFees.add(ADDRESSES.solana.USDC, terminalFeeUsdc, LABELS.TERMINAL_FEES);

  // Cashback / referral payouts are only made from the bot wallet.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, cashback, LABELS.CASHBACK_REFERRAL);

  // Revenue retained by Trojan. Cashback is only paid by the bot, so it is
  // netted against bot fees; Terminal fees are fully retained (no payouts).
  const dailyRevenue = options.createBalances();
  dailyRevenue.add(ADDRESSES.solana.SOL, botFee - cashback, LABELS.BOT_REVENUE);
  dailyRevenue.add(ADDRESSES.solana.SOL, terminalFeeSol, LABELS.TERMINAL_REVENUE);
  dailyRevenue.add(ADDRESSES.solana.USDC, terminalFeeUsdc, LABELS.TERMINAL_REVENUE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  dependencies: [Dependencies.DUNE],
  // Cashback / referral claims are paid in twice-daily batches and can exceed
  // any single window's gross fee inflow. Letting the negative through
  // preserves dailyFees = dailyRevenue + dailySupplySideRevenue across windows.
  allowNegativeValue: true,
  methodology: {
    Fees: 'Per-trade fees collected by the Trojan bot and Terminal fee wallets on DEX swaps (Terminal also collects USDC).',
    Revenue: 'Fees retained by Trojan after cashback and referral payouts.',
    ProtocolRevenue: 'Same as Revenue.',
    SupplySideRevenue: 'Cashback and referral rewards paid out to user trading wallets. Internal treasury sweeps are excluded.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BOT_FEES]: 'Trading fees from the Trojan Telegram bot.',
      [LABELS.TERMINAL_FEES]: 'Trading fees from the Trojan Terminal (SOL and USDC).',
    },
    Revenue: {
      [LABELS.BOT_REVENUE]: 'Bot fees net of cashback / referral payouts.',
      [LABELS.TERMINAL_REVENUE]: 'Terminal fees retained by Trojan.',
    },
    ProtocolRevenue: {
      [LABELS.BOT_REVENUE]: 'Bot fees retained by Trojan.',
      [LABELS.TERMINAL_REVENUE]: 'Terminal fees retained by Trojan.',
    },
    SupplySideRevenue: {
      [LABELS.CASHBACK_REFERRAL]: 'Cashback and referral rewards paid to user trading wallets.',
    },
  },
};

export default adapter;
