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

// Internal treasury sweep destination. The bot wallet periodically performs
// large (~100 SOL each) sweeps to this SystemProgram EOA, which then forwards
// via a Squads multisig (`DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH`) into
// a wSOL treasury account (`ATRsNGv2nDw7hSMfkUTBoVUDsFDwN7po7KbecyiGWNB4`).
// These sweeps are protocol-internal capital movements, NOT user
// distributions, and must be excluded from cashback accounting.
const TROJAN_TREASURY_SWEEP_WALLET = 'DrXMnPrFSiHA4JKKrSktTbAFrfvQCixHKvD7zGHxkzJP';

const ALL_FEE_WALLETS = [TROJAN_BOT_FEE_WALLET, ...TROJAN_TERMINAL_FEE_WALLETS];

const formatAddresses = (addresses: string[]) =>
  addresses.map(a => `'${a}'`).join(', ');

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const allFeeWalletsSql = formatAddresses(ALL_FEE_WALLETS);
  const terminalFeeWalletsSql = formatAddresses(TROJAN_TERMINAL_FEE_WALLETS);

  const query = `
    WITH
    -- Per-trade fee inflows to ANY Trojan fee wallet (bot + terminal).
    allFeePayments AS (
      SELECT
        tx_id,
        address AS fee_wallet,
        balance_change AS fee_lamports
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${allFeeWalletsSql})
        AND balance_change > 0
    ),
    -- Filter to actual DEX trades. dex_solana.trades is the
    -- spell-decoded view of swap transactions; joining excludes
    -- arbitrary SOL transfers into the wallet (e.g. team top-ups
    -- or claims from external sources) so dailyFees is restricted
    -- to true user trading fees.
    botTrades AS (
      SELECT
        trades.tx_id,
        feePayments.fee_wallet,
        MAX(feePayments.fee_lamports) AS fee
      FROM dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments
        ON trades.tx_id = feePayments.tx_id
      WHERE TIME_RANGE
        AND trades.trader_id NOT IN (${allFeeWalletsSql})
      GROUP BY trades.tx_id, feePayments.fee_wallet
    ),
    -- Identify the internal treasury sweep tx_ids so we can exclude
    -- them from cashback accounting. These are the periodic ~100 SOL
    -- transfers where the bot wallet signs a transfer to the multisig
    -- staging EOA.
    treasurySweepTxs AS (
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND address = '${TROJAN_TREASURY_SWEEP_WALLET}'
        AND tx_success
        AND balance_change > 0
    ),
    -- Bot wallet outflows that are user distributions (everything
    -- except the treasury sweeps). Each such tx is a SystemProgram
    -- batched transfer fanning out to ~15 user trading wallets at
    -- a minimum of 0.005 SOL each (per the Trojan docs reward
    -- policy at docs.trojanonsolana.com).
    cashbackPayouts AS (
      SELECT COALESCE(SUM(-balance_change), 0) AS payout_lamports
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND address = '${TROJAN_BOT_FEE_WALLET}'
        AND tx_success
        AND balance_change < 0
        AND tx_id NOT IN (SELECT tx_id FROM treasurySweepTxs)
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
    Fees:
      'Gross per-trade fees collected by Trojan, restricted to DEX trades. Counts SOL inflows to the Trojan bot fee wallet and the five Trojan Terminal fee wallets when the transaction is present in dex_solana.trades — eliminates funding transfers and non-trade inflows.',
    Revenue:
      'Net fees retained by Trojan after cashback and referral rewards have been distributed back to users. Computed as dailyFees minus dailySupplySideRevenue and split between the Bot and Terminal products in proportion to their gross-fee share.',
    ProtocolRevenue:
      'Identical to Revenue (Trojan has no separate token-holder distribution at present).',
    SupplySideRevenue:
      'Cashback and referral rewards paid back to user trading wallets. Per the Trojan rewards program (docs.trojanonsolana.com): up to 35 percent direct referral revenue share, up to 47.5 percent at higher Honors ranks, plus 20 percent (45 percent at higher ranks) cashback on trading fees, paid out in SOL twice a day with a 0.005 SOL minimum per claim. Tracked as outflows from the Trojan bot wallet excluding the periodic large sweeps to the internal multisig staging EOA (DrXMnP...).',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BOT_FEES]:
        'Per-trade fees received by the Telegram bot fee wallet 9yMwSPk9... on swaps initiated via the Trojan TG bot.',
      [LABELS.TERMINAL_FEES]:
        'Per-trade fees received by the five Trojan Terminal fee wallets (92Med3q, 2jwHNxa, 65gDv7p, BWgb8wR, 8jgg7mo) on swaps initiated via trojan.com terminal.',
    },
    Revenue: {
      [LABELS.BOT_REVENUE]:
        'Bot-side gross fees net of the bot share of cashback / referral payouts (allocated proportionally to gross-fee share).',
      [LABELS.TERMINAL_REVENUE]:
        'Terminal-side gross fees net of the terminal share of cashback / referral payouts.',
    },
    ProtocolRevenue: {
      [LABELS.BOT_REVENUE]:
        'Bot-side fees retained by Trojan after cashback / referral distributions.',
      [LABELS.TERMINAL_REVENUE]:
        'Terminal-side fees retained by Trojan after cashback / referral distributions.',
    },
    SupplySideRevenue: {
      [LABELS.CASHBACK_REFERRAL]:
        'Total cashback + referral rewards sent from the Trojan bot wallet to user trading wallets in twice-daily batched SystemProgram transfers (excludes the periodic 100+ SOL sweeps to the internal multisig staging EOA).',
    },
  },
};

export default adapter;
