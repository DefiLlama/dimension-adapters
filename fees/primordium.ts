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

// Bot fee wallet (Telegram bot). Receives per-trade fees AND, twice daily
// (~00:02 / ~12:02 UTC), signs SystemProgram.transfer batches that pay
// cashback + referral rewards out to user trading wallets. Each batch tx
// fans out to ~15 recipients in a single transaction; minimum per-user
// payout is 0.005 SOL per the team docs.
const TROJAN_BOT_FEE_WALLET = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco';

// Trojan Terminal fee wallets (website terminal product). Pure inflow —
// verified zero outflows across 24 h of account_activity history.
const TROJAN_TERMINAL_FEE_WALLETS = [
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
];

// Internal treasury sweeps are identified structurally rather than by a
// hardcoded destination wallet: every twice-daily sweep is a single-recipient
// SystemProgram transfer, whereas every cashback / referral batch fans out to
// ~15 recipients in one tx. The sweep destination has rotated historically
// (pre-Feb 2026: CvdzGdvw9P4eo1wHFCESKqKCtZ3yMaKVydfMJpyKv4pr; post-Feb 2026:
// DrXMnPrFSiHA4JKKrSktTbAFrfvQCixHKvD7zGHxkzJP, which then forwards via a
// Squads multisig DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH into a wSOL
// treasury ATRsNGv2nDw7hSMfkUTBoVUDsFDwN7po7KbecyiGWNB4), so filtering by
// recipient count is robust to further rotations.

const ALL_FEE_WALLETS = [TROJAN_BOT_FEE_WALLET, ...TROJAN_TERMINAL_FEE_WALLETS];

const formatAddresses = (addresses: string[]) =>
  addresses.map(a => `'${a}'`).join(', ');

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const allFeeWalletsSql = formatAddresses(ALL_FEE_WALLETS);
  const terminalFeeWalletsSql = formatAddresses(TROJAN_TERMINAL_FEE_WALLETS);

  const query = `
    WITH
    -- Single pass over the day's partition for ALL fee-wallet activity
    -- (both bot + terminal inflows AND bot outflows). Downstream CTEs
    -- filter this materialised set instead of re-scanning the partition.
    feeWalletActivity AS (
      SELECT tx_id, address, balance_change
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${allFeeWalletsSql})
    ),
    -- Positive balance changes = per-trade fee inflows.
    allFeePayments AS (
      SELECT tx_id, address AS fee_wallet, balance_change AS fee_lamports
      FROM feeWalletActivity
      WHERE balance_change > 0
    ),
    -- Restrict to txs that are real DEX trades (spell-decoded swaps).
    -- EXISTS instead of JOIN avoids row blow-up from multi-hop trades
    -- and lets the planner short-circuit on first qualifying trade row.
    botTrades AS (
      SELECT fp.tx_id, fp.fee_wallet, MAX(fp.fee_lamports) AS fee
      FROM allFeePayments fp
      WHERE EXISTS (
        SELECT 1
        FROM dex_solana.trades t
        WHERE t.tx_id = fp.tx_id
          AND TIME_RANGE
          AND t.trader_id NOT IN (${allFeeWalletsSql})
      )
      GROUP BY fp.tx_id, fp.fee_wallet
    ),
    -- Negative balance changes from the bot wallet = outflow txs.
    botOutflowTxs AS (
      SELECT tx_id, -balance_change AS lamports_out
      FROM feeWalletActivity
      WHERE address = '${TROJAN_BOT_FEE_WALLET}'
        AND balance_change < 0
    ),
    -- For each outflow tx, count distinct non-bot positive-balance-change
    -- recipients. Treasury sweeps are single-recipient SystemProgram
    -- transfers (~200 SOL to the rotating staging EOA); cashback /
    -- referral batches fan out to ~15 recipients per tx (per Trojan docs:
    -- 0.005 SOL minimum, twice-daily). The recipient-count heuristic is
    -- robust to sweep-destination rotations (verified across the
    -- Jan→Feb 2026 Cvdz→DrXMnP rotation). The tx_id IN-filter narrows
    -- the scan from "every positive balance_change in the partition" to
    -- only the handful of bot-outflow txs.
    outflowRecipients AS (
      SELECT bo.tx_id, bo.lamports_out, COUNT(DISTINCT aa.address) AS num_recipients
      FROM botOutflowTxs bo
      LEFT JOIN solana.account_activity aa
        ON aa.tx_id = bo.tx_id
       AND aa.address != '${TROJAN_BOT_FEE_WALLET}'
       AND aa.balance_change > 0
      WHERE TIME_RANGE
        AND aa.tx_id IN (SELECT tx_id FROM botOutflowTxs)
      GROUP BY bo.tx_id, bo.lamports_out
    ),
    cashbackPayouts AS (
      SELECT COALESCE(SUM(lamports_out), 0) AS payout_lamports
      FROM outflowRecipients
      WHERE num_recipients >= 2
    )
    SELECT
      (SELECT COALESCE(SUM(fee), 0)
         FROM botTrades
        WHERE fee_wallet = '${TROJAN_BOT_FEE_WALLET}') AS bot_fee_lamports,
      (SELECT COALESCE(SUM(fee), 0)
         FROM botTrades
        WHERE fee_wallet IN (${terminalFeeWalletsSql})) AS terminal_fee_lamports,
      (SELECT payout_lamports FROM cashbackPayouts) AS cashback_payout_lamports
  `;

  const [row] = await queryDuneSql(options, query);
  const botFee = Number(row?.bot_fee_lamports ?? 0);
  const terminalFee = Number(row?.terminal_fee_lamports ?? 0);
  const cashbackPayout = Number(row?.cashback_payout_lamports ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, botFee, LABELS.BOT_FEES);
  dailyFees.add(ADDRESSES.solana.SOL, terminalFee, LABELS.TERMINAL_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(
    ADDRESSES.solana.SOL,
    cashbackPayout,
    LABELS.CASHBACK_REFERRAL,
  );

  // Net revenue retained by Trojan, split between the Bot and Terminal
  // products in proportion to their gross-fee share. Cashback / referral
  // claims are only emitted by the bot wallet so allocating the supply-side
  // share strictly by gross-fee share is the closest reasonable mapping.
  const dailyRevenue = options.createBalances();
  const totalFee = botFee + terminalFee;
  if (totalFee > 0) {
    const botShare = botFee / totalFee;
    const terminalShare = terminalFee / totalFee;
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      botFee - cashbackPayout * botShare,
      LABELS.BOT_REVENUE,
    );
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      terminalFee - cashbackPayout * terminalShare,
      LABELS.TERMINAL_REVENUE,
    );
  } else if (cashbackPayout > 0) {
    // Pure-payout day with zero gross fees: attribute the negative
    // residual to the bot side (terminal wallets have no observed
    // outflows so cannot account for it).
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      -cashbackPayout,
      LABELS.BOT_REVENUE,
    );
  }

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
  // pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  dependencies: [Dependencies.DUNE],
  // Cashback / referral claims are paid in twice-daily batches and can
  // exceed any single window's gross fee inflow. Letting the negative
  // through preserves dailyFees = dailyRevenue + dailySupplySideRevenue
  // across longer windows.
  allowNegativeValue: true,
  methodology: {
    Fees: 'Per-trade fees collected by the Trojan bot and Terminal fee wallets on DEX swaps.',
    Revenue: 'Fees retained by Trojan after cashback and referral payouts.',
    ProtocolRevenue: 'Same as Revenue.',
    SupplySideRevenue: 'Cashback and referral rewards paid out to user trading wallets.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BOT_FEES]: 'Trading fees from the Trojan Telegram bot.',
      [LABELS.TERMINAL_FEES]: 'Trading fees from the Trojan Terminal.',
    },
    Revenue: {
      [LABELS.BOT_REVENUE]: 'Bot fees net of cashback / referral payouts.',
      [LABELS.TERMINAL_REVENUE]: 'Terminal fees net of cashback / referral payouts.',
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
