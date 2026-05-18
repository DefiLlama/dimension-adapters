import ADDRESSES from '../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Labels used in .add() / .addUSDValue() calls. Each appears in breakdownMethodology.
const LABELS = {
  BOT_FEES: 'Trojan Bot Fees',
  TERMINAL_FEES: 'Trojan Terminal Fees',
  BOT_FEES_TO_PROTOCOL: 'Trojan Bot Fees To Protocol',
  TERMINAL_FEES_TO_PROTOCOL: 'Trojan Terminal Fees To Protocol',
  CASHBACK_REFERRAL_PAYOUTS: 'Trojan Cashback/Referral Payouts',
} as const;

// Bot wallet: receives Telegram-bot trade fees AND is the payout origin for
// batched cashback / referral claims back to users. Over 24 h on 2026-05-18
// this wallet shows ~622 SOL inflows across 95 k txs (per-trade fees) and
// ~673 SOL outflows across ~483 txs (batched claim payouts) — the same
// dual-role shape Shaileshkhote handled for Padre's DoAsx... wallet in
// #6997 and Axiom's AxiomRX... cashback wallets in #6789.
const TROJAN_BOT_FEE_WALLET = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco';

// Terminal wallets: receive trade fees from the website terminal product.
// Verified pure-inflow on 2026-05-18 (zero outflows over the 24 h window).
const TROJAN_TERMINAL_FEE_WALLETS = [
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
];

const ALL_FEE_WALLETS = [TROJAN_BOT_FEE_WALLET, ...TROJAN_TERMINAL_FEE_WALLETS];

const formatAddresses = (addresses: string[]) =>
  addresses.map(a => `'${a}'`).join(', ');

const fetch = async (options: FetchOptions) => {
  const allFeeWalletsSql = formatAddresses(ALL_FEE_WALLETS);
  const terminalFeeWalletsSql = formatAddresses(TROJAN_TERMINAL_FEE_WALLETS);

  const query = `
    WITH
    allFeePayments AS (
      -- Per-trade fee deltas to any Trojan fee wallet (bot + terminal)
      SELECT
        tx_id,
        address AS fee_wallet,
        balance_change AS fee_token_amount
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${allFeeWalletsSql})
        AND balance_change > 0
    ),
    botTrades AS (
      -- Filter to txs that are actual DEX trades (excludes random transfers
      -- to the wallet) and split the per-tx fee inflow by which Trojan
      -- wallet it landed in so we can break down bot vs terminal fees.
      SELECT
        trades.tx_id,
        feePayments.fee_wallet,
        MAX(feePayments.fee_token_amount) AS fee
      FROM dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments
        ON trades.tx_id = feePayments.tx_id
      WHERE TIME_RANGE
        AND trades.trader_id NOT IN (${allFeeWalletsSql})
      GROUP BY trades.tx_id, feePayments.fee_wallet
    ),
    cashbackPayouts AS (
      -- Outflows from the bot wallet are the batched claim payouts that
      -- distribute cashback / referral rewards back to users. The bot
      -- wallet has no observed inflows from any other Trojan wallet, so
      -- there are no internal interfund transfers to net out (unlike
      -- Padre, which has J5XGH... -> DoAsx... top-ups). All bot outflows
      -- therefore go to non-Trojan recipients and represent user
      -- distributions.
      SELECT COALESCE(SUM(-balance_change), 0) AS payout_amount
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND address = '${TROJAN_BOT_FEE_WALLET}'
        AND tx_success
        AND balance_change < 0
    )
    SELECT
      (SELECT COALESCE(SUM(fee), 0)
         FROM botTrades
        WHERE fee_wallet = '${TROJAN_BOT_FEE_WALLET}') AS bot_fee,
      (SELECT COALESCE(SUM(fee), 0)
         FROM botTrades
        WHERE fee_wallet IN (${terminalFeeWalletsSql})) AS terminal_fee,
      (SELECT payout_amount FROM cashbackPayouts) AS cashback_payout
  `;

  const [row] = await queryDuneSql(options, query);
  const botFee = Number(row?.bot_fee ?? 0);
  const terminalFee = Number(row?.terminal_fee ?? 0);
  const cashbackPayout = Number(row?.cashback_payout ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, botFee, LABELS.BOT_FEES);
  dailyFees.add(ADDRESSES.solana.SOL, terminalFee, LABELS.TERMINAL_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(
    ADDRESSES.solana.SOL,
    cashbackPayout,
    LABELS.CASHBACK_REFERRAL_PAYOUTS,
  );

  // Revenue retained by Trojan = total fees minus cashback / referral
  // payouts. Split the retained revenue proportionally across the bot and
  // terminal products so the breakdown remains coherent on the income
  // statement. If users claim more than today's gross fees (a "loss day"
  // — caused by claim-timing rather than negative protocol margins), the
  // adapter's allowNegativeValue lets the net through; over a longer
  // window this averages out.
  const dailyRevenue = options.createBalances();
  const totalFee = botFee + terminalFee;
  if (totalFee > 0) {
    const botShare = botFee / totalFee;
    const terminalShare = terminalFee / totalFee;
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      botFee - cashbackPayout * botShare,
      LABELS.BOT_FEES_TO_PROTOCOL,
    );
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      terminalFee - cashbackPayout * terminalShare,
      LABELS.TERMINAL_FEES_TO_PROTOCOL,
    );
  } else if (cashbackPayout > 0) {
    // Edge case: pure-payout day with zero gross fees. Attribute the
    // negative residual to the bot side (terminal wallets have no observed
    // outflows so the negative cannot belong to terminal).
    dailyRevenue.add(
      ADDRESSES.solana.SOL,
      -cashbackPayout,
      LABELS.BOT_FEES_TO_PROTOCOL,
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
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  dependencies: [Dependencies.DUNE],
  // Per-trade cashback / referral claims can be batched and paid days
  // after the trades that generated them. Letting negative same-day
  // revenue through preserves the income-statement invariant
  // dailyFees = dailyRevenue + dailySupplySideRevenue over any window.
  allowNegativeValue: true,
  methodology: {
    Fees:
      "Sum of trading fees collected by Trojan from the Telegram bot wallet and the five Trojan Terminal fee wallets, restricted to transactions identified as DEX trades in dex_solana.trades. Tracks the gross fees paid by users before cashback / referral distributions.",
    Revenue:
      "Net fees retained by Trojan after cashback and referral payouts have been subtracted. Computed as dailyFees - dailySupplySideRevenue, split proportionally between the Trojan Bot and Trojan Terminal products.",
    ProtocolRevenue:
      "Fees retained by Trojan after cashback / referral distributions (identical to Revenue — Trojan has no separate token-holder share at present).",
    SupplySideRevenue:
      "Cashback and referral rewards distributed back to users. Tracked as the outflows from the Trojan bot wallet, which is the protocol payout origin for batched claim transactions. Per issue #6739: referral / cashback payouts are user distributions and are subtracted from revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BOT_FEES]:
        "Per-trade fees received by the Trojan bot wallet (9yMwSPk9...) on swaps initiated via the Telegram bot.",
      [LABELS.TERMINAL_FEES]:
        "Per-trade fees received by the five Trojan Terminal fee wallets (92Med3q..., 2jwHNxa..., 65gDv7p..., BWgb8wR..., 8jgg7mo...) on swaps initiated via the website terminal.",
    },
    Revenue: {
      [LABELS.BOT_FEES_TO_PROTOCOL]:
        "Trojan Bot Fees net of the bot side of cashback / referral payouts (allocated by gross-fee share).",
      [LABELS.TERMINAL_FEES_TO_PROTOCOL]:
        "Trojan Terminal Fees net of the terminal side of cashback / referral payouts (allocated by gross-fee share).",
    },
    ProtocolRevenue: {
      [LABELS.BOT_FEES_TO_PROTOCOL]:
        "Trojan Bot Fees net of the bot side of cashback / referral payouts.",
      [LABELS.TERMINAL_FEES_TO_PROTOCOL]:
        "Trojan Terminal Fees net of the terminal side of cashback / referral payouts.",
    },
    SupplySideRevenue: {
      [LABELS.CASHBACK_REFERRAL_PAYOUTS]:
        "Cashback and referral rewards distributed back to users via batched outflows from the Trojan bot wallet.",
    },
  },
};

export default adapter;
