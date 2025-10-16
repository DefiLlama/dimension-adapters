import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/4043813/6866844

import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const transfer_txs = await queryIndexer(`
      SELECT
          block_time,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
      FROM
          ethereum.event_logs
      WHERE
          block_number > 18332267
          AND contract_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 18332267
                  AND from_address IN ('\\x28B108B9932dD9E26103b9d3ed1999d3087F537d')
                  AND "type" = 'create'
          )
          AND topic_0 = '\\x9377d2ca0fa4b8097cf0c9128e900f40fc24811a43eefb75da59072dbbcc8c85'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);

  transfer_txs.map((e: any) => {
    const amount = Number('0x' + e.data.slice((5 * 64), (5 * 64) + 64))
    dailyFees.addGasToken(amount);
  })

  return { dailyFees, dailyRevenue: dailyFees, timestamp }
}

const fetchSolana = async (_: any, _1: any, options: FetchOptions) => {
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
        AND address = '9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy'
        AND tx_success
        AND balance_change > 0 
    )
    SELECT
      SUM(fee_token_amount) AS fee
    FROM
      dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
    WHERE
      TIME_RANGE
      AND trades.trader_id != '9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy'
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-10-13',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-01-14',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees paid by users while using Shuriken bot.",
    Revenue: "All fees are collected by Shuriken protocol.",
  }
};

export default adapter;
