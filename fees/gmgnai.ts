import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/adam_tehc/gmgn
// https://dune.com/queries/3958821/6661029

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getETHReceived } from '../helpers/token';

const fetchSolana: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

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
        AND address in (
          'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT',
          '7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA',
          'HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3',
          'ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy',
          'DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9',
          '3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK',
          'DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx',
          'dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ',
          '6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn'
        )
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
      AND trades.trader_id not in (
        'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT',
        '7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA',
        'HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3',
        'ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy',
        'DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9',
        '3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK',
        'DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx',
        'dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ',
        '6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn'
      )
    GROUP BY trades.tx_id
  )
  SELECT
    SUM(fee) AS fee
  FROM
    botTrades
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, }
}

const feeCollector = '0xb8159ba378904F803639D274cEc79F788931c9C8'

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await getETHReceived({ options: options, balances: dailyFees, target: feeCollector})
  return {
    dailyFees,
    dailyRevenue: dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BSC]: {
      start: '2024-12-02'
    },
     [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-03-20'
     }
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using GMGN AI bot.",
    Revenue: "Trading fees are collected by GMGN AI protocol."
  }
};

export default adapter;
