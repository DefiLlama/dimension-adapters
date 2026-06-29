import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/4043813/6866844

import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (): Promise<FetchResultFees> => {
  return {} // stop using indexa db
}

const fetchSolana = async (options: FetchOptions) => {
  throw new Error('This returns empty, no point running it')
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
        AND address IN (
          '9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy',
          'shuvodtwMMFFB6KmqCDYaiAe1hRokCVwr4LkT1pLAL5'
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
        AND trades.trader_id not IN (
          '9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy',
          'shuvodtwMMFFB6KmqCDYaiAe1hRokCVwr4LkT1pLAL5'
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
