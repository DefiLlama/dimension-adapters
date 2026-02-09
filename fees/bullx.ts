import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/3819841/6424423
// https://dune.com/queries/4601837

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from '../helpers/metrics';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  // Determine which address/trader_id to use based on date 2024-11-16
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const cutoffTimestamp = 1731715200;
  const isNewAddress = options.startOfDay >= cutoffTimestamp;

  const address = isNewAddress ? '9RYJ3qr5eU5xAooqVcbmdeusjcViL5Nkiq7Gske3tiKq' : 'F4hJ3Ee3c5UuaorKAMfELBjYCjiiLH75haZTKqTywRP3';
  const traderId = isNewAddress ? '9RYJ3qr5eU5xAooqVcbmdeusjcViL5Nkiq7Gske3tiKq' : 'F4hJ3Ee3c5UuaorKAMfELBjYCjiiLH75haZTKqTywRP3';

  const query = `
    WITH
    all_fee_payments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = '${address}'
        AND balance_change > 0
        AND tx_success
    ),
    bot_trades AS (
      SELECT
        fp.fee_token_amount
      FROM
        dex_solana.trades t
        JOIN all_fee_payments fp ON t.tx_id = fp.tx_id
      WHERE
        TIME_RANGE
        AND trader_id != '${traderId}'
    )
    SELECT
      SUM(fee_token_amount) AS fee
    FROM
      bot_trades
  `;

  const fees = await queryDuneSql(options, query);

  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee, [METRIC.TRADING_FEES]);
  dailyRevenue.add(ADDRESSES.solana.SOL, fees[0].fee, [METRIC.TRADING_FEES]);

  return {
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-04-03',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users while using BullX bot.",
    Revenue: "Trading fees are collected by BullX protocol."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "SOL fees collected from user trades executed through the BullX trading bot on Solana DEXes.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "SOL revenue retained by BullX protocol from user trading activity.",
    },
  }
};

export default adapter;
