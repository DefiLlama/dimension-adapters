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
  burnWallet: '9jHrTCwpDANHLNQz5cem6XLUBM8KiTWKe766Br6KVCXM',
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
  const { mainFeeWallet, feeCashbackWallet, burnWallet } = solanaConfig
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
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
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
    ),
    burnWalletInflows AS (
      SELECT
        COALESCE(SUM(balance_change), 0) AS buyback_burn_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = '${burnWallet}'
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
        AND trades.trader_id != '${mainFeeWallet}'
        AND trades.trader_id != '${feeCashbackWallet}'
        AND trades.trader_id != '${burnWallet}'
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee,
      (SELECT payout_amount FROM cashbackPayouts) AS cashback_payout_amount,
      (SELECT buyback_burn_amount FROM burnWalletInflows) AS buyback_burn_amount
    FROM
      botTrades
  `;

  const [row] = await queryDuneSql(options, query);
  const tradingFees = Number(row?.fee ?? 0);
  const cashbackPayouts = Number(row?.cashback_payout_amount ?? 0);
  const buybackBurnAmount = Number(row?.buyback_burn_amount ?? 0);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, tradingFees, LABELS.TRADING_TERMINAL_FEES);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, cashbackPayouts, LABELS.CASHBACK_REFERRAL_PAYOUTS);
  dailyRevenue.add(ADDRESSES.solana.SOL, tradingFees - cashbackPayouts - buybackBurnAmount, LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL);

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
    [LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL]: 'Trading terminal fees retained by the protocol after cashback/referral payouts and buyback/burn allocations.',
  },
  ProtocolRevenue: {
    [LABELS.TRADING_TERMINAL_FEES_TO_PROTOCOL]: 'Trading terminal fees retained by the protocol after cashback/referral payouts and buyback/burn allocations.',
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
    Revenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts and buyback/burn allocations.",
    ProtocolRevenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts and buyback/burn allocations.",
    SupplySideRevenue: "All outbound transfers from the cashback/referral wallet.",
  },
  allowNegativeValue: true,
};

export default adapter;
