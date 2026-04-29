import ADDRESSES from '../../helpers/coreAssets.json'
import { addGasTokensReceived, addTokensReceived } from '../../helpers/token';
// source: https://dune.com/queries/5028370/8311321

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago
const TRADING_TERMINAL_FEES = 'Trading Terminal Fees'

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
  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address IN ('J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5', 'DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb')
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
        AND trades.trader_id != 'J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5'
        AND trades.trader_id != 'DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb'
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
  `;

  const fees = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee || 0);
  return dailyFees
}

async function fetchEvm(options: FetchOptions) {
  const config = evmChainConfig[options.chain]
  const fees =  await addGasTokensReceived({
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

export const fetch = async (_: any, _1: any, options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill)
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const fees = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEvm(options)

  const dailyFees = fees.clone(1, TRADING_TERMINAL_FEES)

  return { dailyFees, dailyRevenue: dailyFees }
}

export const breakdownMethodology = {
  Fees: {
    [TRADING_TERMINAL_FEES]: 'Fees charged on each trade executed through the trading terminal.',
  },
  Revenue: {
    [TRADING_TERMINAL_FEES]: 'Trading terminal fees retained by the protocol.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA, CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE],
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  start: '2024-07-28',
  deadFrom: '2025-10-24',
  isExpensiveAdapter: true,
  breakdownMethodology,
  methodology: {
    Fees: "Trading fees paid by users while using Padre bot.",
    Revenue: "All fees are collected by Padre protocol.",
  },
};

export default adapter;
