import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const WORM_PROGRAM = "WrgN8d3Xe7qTzZw59kiXaf3fAagHHWg78Mbhkn2dTPD";
const CREATOR_PROGRAM = "SormXyTMQ69ux8yhn9CBQ8v7UuqepefMHbM5TcNDtkf";

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH calls AS (
      SELECT
        CASE
          WHEN executing_account = '${CREATOR_PROGRAM}' THEN 'creator_market'
          WHEN bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) = 100 THEN 'normal_market'
          ELSE 'leverage_market'
        END AS product,
        CASE
          WHEN executing_account = '${CREATOR_PROGRAM}'
            THEN bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) / 1e6
          ELSE bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 17, 8))) / 1e6
        END AS collateral_usd
      FROM solana.instruction_calls
      WHERE block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
        AND tx_success = true
        AND (
          (
            executing_account = '${WORM_PROGRAM}'
            AND bytearray_length(data) = 25
            AND bytearray_substring(data, 1, 8) = 0x87802f4d0f98f031
            AND bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) BETWEEN 100 AND 1000
          )
          OR (
            executing_account = '${CREATOR_PROGRAM}'
            AND bytearray_length(data) = 16
            AND bytearray_substring(data, 1, 8) = 0x33c29baf6d82606a
          )
        )
    )

    SELECT
      product,
      SUM(collateral_usd) * 0.05 AS fees_usd,
      SUM(collateral_usd) * IF(product = 'creator_market', 0.025, 0.05) AS revenue_usd,
      SUM(collateral_usd) * IF(product = 'creator_market', 0.025, 0) AS supply_side_revenue_usd
    FROM calls
    GROUP BY 1
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  rows.forEach((row: any) => {
    dailyFees.addUSDValue(Number(row.fees_usd), METRIC.TRADING_FEES);
    dailyRevenue.addUSDValue(Number(row.revenue_usd), METRIC.TRADING_FEES);
    dailySupplySideRevenue.addUSDValue(Number(row.supply_side_revenue_usd), METRIC.CREATOR_FEES);
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-04",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees are 5% of the USDC amount bet on Worm markets.",
    Revenue: "Worm keeps the full 5% fee on normal and leverage markets, and keeps 2.5% on creator markets.",
    SupplySideRevenue: "Creator market creators receive the other 2.5% fee share.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "5% of the USDC amount bet across normal, leverage, and creator markets.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Protocol share of market fees: 5% on normal and leverage markets, 2.5% on creator markets.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Creator share of creator market fees.",
    },
  },
};

export default adapter;
