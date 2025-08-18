import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/adam_tehc/vectorfun
// https://dune.com/queries/4411229/7390130

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const query = `
        WITH
        allFeePayments AS (
            SELECT
              tx_id,
              balance_change AS fee_token_amount
            FROM
              solana.account_activity
            WHERE
              block_time >= TIMESTAMP '2024-07-28'
              AND TIME_RANGE
              AND address IN (
                'EvMii962PiDkygT6qHWVTDamadqhDyHu4Mco7aNfRsp8',
                '5Arp4KGGXdobT8LxSBLRLUDYEa3rh77frgEYsvTHTYka',
                '5W3rMZSgus2mQVb2dYA9qR8Z1YLzcu5fjBNm8P3wmoEw',
                'GdZJRqonwzeWRneFVrniwU5PeQqJa7bB8G12qdQqhU1H',
                '7etTJL5WnHidy4AD1JbwBo76BtPtnxAmRRbG7un6QjYX',
                '66eUcZJT8BNQZoGiLGfv9yBts2uxWQxCy3UuBnDT5rG1',
                'BtqgEzQDCH3JFjJ6hFRsQB7Aacg9zmV6yDR96vH5vyC5',
                's1gnrNn3b3zs1MCAGYzXsBn13v41HP9nq4JZZGpLESL',
                '9ZeKZdYzVii2a22ajnXSkVrqkwkkyjWpkjT3oVyEqw46',
                '8YihpEuQnMoRYgRPdWSPbVLXmP8Fwzzbr8YZCYY6Fmf1',
                '9umoGVjHCM5mm4UTyjq9QstAvg2DxdhgdECBuqkjji6x'
              )
              AND balance_change > 0
              AND tx_success
        )
        SELECT
          SUM(fee_token_amount) AS fee
        FROM
          dex_solana.trades AS trades
          JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
        WHERE
          TIME_RANGE
          AND trades.trader_id NOT IN (
            'EvMii962PiDkygT6qHWVTDamadqhDyHu4Mco7aNfRsp8',
            '5Arp4KGGXdobT8LxSBLRLUDYEa3rh77frgEYsvTHTYka',
            '5W3rMZSgus2mQVb2dYA9qR8Z1YLzcu5fjBNm8P3wmoEw',
            'GdZJRqonwzeWRneFVrniwU5PeQqJa7bB8G12qdQqhU1H',
            '7etTJL5WnHidy4AD1JbwBo76BtPtnxAmRRbG7un6QjYX',
            '66eUcZJT8BNQZoGiLGfv9yBts2uxWQxCy3UuBnDT5rG1',
            'BtqgEzQDCH3JFjJ6hFRsQB7Aacg9zmV6yDR96vH5vyC5',
            '9ZeKZdYzVii2a22ajnXSkVrqkwkkyjWpkjT3oVyEqw46',
            's1gnrNn3b3zs1MCAGYzXsBn13v41HP9nq4JZZGpLESL',
            '8YihpEuQnMoRYgRPdWSPbVLXmP8Fwzzbr8YZCYY6Fmf1',
            '9umoGVjHCM5mm4UTyjq9QstAvg2DxdhgdECBuqkjji6x'
          )
    `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-07-28',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading and launching tokens fees paid by users.",
    Revenue: "All fees are collected by Vector.Fun protocol.",
    ProtocolRevenue: "Trading fees are collected by Vector.Fun protocol.",
  }
};

export default adapter;