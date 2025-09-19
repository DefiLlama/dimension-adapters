import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/o1_exchange
// https://dune.com/queries/4966625/8220176

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH trading_data AS (
      SELECT 
            block_date, 
            SUM(amount_raw / POWER(10, 18)) AS base_trading_fees_eth,
            SUM(amount_usd) AS base_trading_fees_usd,
            SUM(amount_raw / POWER(10, 18)) * 100 AS base_trading_volume_eth,
            SUM(amount_usd) * 100 AS base_trading_volume_usd
        FROM tokens_base.transfers
        WHERE to = 0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4
        GROUP BY block_date
    ), solana_data AS (
      SELECT
        DATE_TRUNC('day', block_time) AS block_date,
        SUM(amount_usd) AS trading_fees_usd,
        SUM(amount_usd) * 100 AS trading_volume_usd
      FROM tokens_solana.transfers
      WHERE
        to_owner = 'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc'
        AND block_time > TIMESTAMP '2025-07-01'
      GROUP BY
        DATE_TRUNC('day', block_time)
    )
    SELECT
      SUM(
        COALESCE(s.trading_fees_usd, 0) + COALESCE(t.base_trading_fees_usd, 0)
      ) AS total_lifetime_trading_fees
    FROM solana_data AS s
    LEFT JOIN trading_data AS t
      ON s.block_date = t.block_date
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Trading fees paid by users while using o1.exchange.",
    Revenue: "All fees are collected by o1.exchange.",
  },
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-07-01',
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
