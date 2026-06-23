import ADDRESSES from '../../helpers/coreAssets.json'
import { addGasTokensReceived, addTokensReceived } from '../../helpers/token';
// source: https://dune.com/queries/5028370/8311321

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const LABELS = {
  TRADING_TERMINAL_FEES: 'Trading Terminal Fees',
  TRADING_TERMINAL_FEES_TO_PROTOCOL: 'Trading Terminal Fees To Protocol',
  CASHBACK_REFERRAL_PAYOUTS: 'Cashback/Referral Payouts',
} as const

const solanaConfig = {
  mainFeeWallet: 'J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5',
  feeCashbackWallet: 'DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb',
}

const evmChainConfig: any = {
  [CHAIN.ETHEREUM]: {
    feeWallet: '0xa74FA823bC8617fa320A966b3d11B0f722eF09eE',
  },
  [CHAIN.BSC]: {
    feeWallet: '0x2b0A28A0A9197F8Af5d1B8371C048e92Dd78B640',
  },
  [CHAIN.BASE]: {
    feeWallet: '0x16388de42c5829fD0E88c8Eb001eF43bfc93F177',
  },
}

async function fetchSolana(options: FetchOptions) {
  const { mainFeeWallet, feeCashbackWallet } = solanaConfig
  // Each trade fee is split in-tx: the protocol portion lands in mainFeeWallet (swept to treasury)
  // and the cashback/referral portion lands in feeCashbackWallet (paid out to ~thousands of users).
  // Fees = the full charge = every non-internal inflow to BOTH wallets. The previous query took
  // MAX(inflow) per tx (dropping the smaller split leg, ~32%) and inner-joined dex_solana.trades
  // (dropping undecoded Pump/router trades, ~24% more), which understated fees ~2x and made the
  // ~46% cashback look like ~90%, crushing revenue.
  const query = `
    WITH
    interfundTransfers AS (
      SELECT
        tx_id
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND address IN ('${mainFeeWallet}', '${feeCashbackWallet}')
      GROUP BY tx_id
      HAVING
        SUM(CASE WHEN address = '${mainFeeWallet}' AND balance_change < 0 THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN address = '${feeCashbackWallet}' AND balance_change > 0 THEN 1 ELSE 0 END) > 0
    ),
    feeInflows AS (
      SELECT
        COALESCE(SUM(balance_change), 0) AS fee_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address IN ('${mainFeeWallet}', '${feeCashbackWallet}')
        AND tx_success
        AND balance_change > 0
        AND NOT (address = '${feeCashbackWallet}' AND tx_id IN (SELECT tx_id FROM interfundTransfers))
    ),
    cashbackPayouts AS (
      SELECT
        COALESCE(SUM(-balance_change), 0) AS payout_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = '${feeCashbackWallet}'
        AND tx_success
        AND balance_change < 0
    )
    SELECT
      (SELECT fee_amount FROM feeInflows) AS fee,
      (SELECT payout_amount FROM cashbackPayouts) AS cashback_payout_amount
  `;

  const [row] = await queryDuneSql(options, query);
  const tradingFees = Number(row?.fee ?? 0);
  const cashbackPayouts = Number(row?.cashback_payout_amount ?? 0);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, tradingFees, LABELS.TRADING_TERMINAL_FEES);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, cashbackPayouts, LABELS.CASHBACK_REFERRAL_PAYOUTS);
  // Revenue = the protocol's portion = fees minus what the cashback wallet pays back out to
  // users/referrers. (Buyback/burn is a lumpy treasury distribution funded out of this retained
  // revenue, not a daily fee deduction, so it is intentionally not subtracted here.)
  dailyRevenue.add(ADDRESSES.solana.SOL, tradingFees - cashbackPayouts, LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

async function fetchEvm(options: FetchOptions) {
  const config = evmChainConfig[options.chain]
  const fees = await addGasTokensReceived({
    options,
    balances: options.createBalances(),
    multisig: config.feeWallet,
  })
  await addTokensReceived({
    options,
    balances: fees,
    target: config.feeWallet,
  })
  return fees
}

export const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options)

  const fees = await fetchEvm(options)
  const dailyFees = fees.clone(1, LABELS.TRADING_TERMINAL_FEES)
  const dailyRevenue = fees.clone(1, LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

export const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_TERMINAL_FEES]: 'Fees charged on each trade executed through the trading terminal.',
  },
  Revenue: {
    [LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL]: 'Trading terminal fees retained by the protocol after cashback/referral payouts.',
  },
  ProtocolRevenue: {
    [LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL]: 'Trading terminal fees retained by the protocol after cashback/referral payouts.',
  },
  SupplySideRevenue: {
    [LABELS.CASHBACK_REFERRAL_PAYOUTS]: 'All outbound transfers from the cashback/referral wallet.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA, CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE],
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  start: '2025-10-24',
  isExpensiveAdapter: true,
  breakdownMethodology,
  methodology: {
    Fees: "Trading fees paid by users while using Pump Trading Terminal(previously known as Padre).",
    Revenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts.",
    ProtocolRevenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts.",
    SupplySideRevenue: "All outbound transfers from the cashback/referral wallet.",
  },
  allowNegativeValue: true,
};

export default adapter;
