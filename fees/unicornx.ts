import ADDRESSES from "../helpers/coreAssets.json";

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { evmReceivedGasAndTokens } from "../helpers/token";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
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
        AND address = '9mAZ2HFYfUW9r1rYpM1cAsQTWS7SUp49AW1VzoLaPNgr' 
        AND tx_success
        AND balance_change > 0 
  )
  SELECT
    SUM(fee_token_amount) AS fee
  FROM
    dex_solana.trades AS trades
    JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
  WHERE
    trades.trader_id != '9mAZ2HFYfUW9r1rYpM1cAsQTWS7SUp49AW1VzoLaPNgr'
    AND TIME_RANGE
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: "2025-01-22",
      meta: {
        methodology: {
          Fees: "All trading fees paid by users while using UnicornX app and website.",
          Revenue: "Trading fees are collected by UnicornX.",
        },
      },
    },
    [CHAIN.BSC]: {
      fetch: async (_: any, _1: any, options: FetchOptions) =>
        evmReceivedGasAndTokens(
          "0xCb077A7f06D54c582eD82f5C5ef9FeFB9B8Be449",
          []
        )(options),
      start: "2025-03-30",
      meta: {
        methodology: {
          Fees: "All trading fees paid by users while using UnicornX app and website.",
          Revenue: "Trading fees are collected by UnicornX.",
        },
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
