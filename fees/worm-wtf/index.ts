import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

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
      WHERE TIME_RANGE
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
      SUM(collateral_usd) * IF(product = 'creator_market', 0, 0.05) AS normal_market_fee_usd,
      SUM(collateral_usd) * IF(product = 'creator_market', 0.05, 0) AS creator_market_fee_usd,
      
      SUM(collateral_usd) * IF(product = 'creator_market', 0, 0.05) AS normal_market_revenue_usd,
      SUM(collateral_usd) * IF(product = 'creator_market', 0.025, 0) AS creator_market_revenue_usd,

      SUM(collateral_usd) * IF(product = 'creator_market', 0.025, 0) AS creator_market_supply_side_revenue_usd
    FROM calls
    GROUP BY 1
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  rows.forEach((row: any) => {
    dailyFees.addUSDValue(Number(row.normal_market_fee_usd), 'Normal Markets Fees');
    dailyFees.addUSDValue(Number(row.creator_market_fee_usd), 'Creator Markets Fees');

    dailyRevenue.addUSDValue(Number(row.normal_market_revenue_usd), 'Normal Markets Fees To Protocol');
    dailyRevenue.addUSDValue(Number(row.creator_market_revenue_usd), 'Creator Markets Fees To Protocol');

    dailySupplySideRevenue.addUSDValue(Number(row.creator_market_supply_side_revenue_usd), 'Creator Markets Fees To Creators');
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
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
    ProtocolRevenue: "Worm keeps the full 5% fee on normal and leverage markets, and keeps 2.5% on creator markets.",
    SupplySideRevenue: "Creator market creators receive the other 2.5% fee share.",
  },
  breakdownMethodology: {
    Fees: {
      "Normal Markets Fees": "5% of the USDC amount bet across normal, leverage markets.",
      "Creator Markets Fees": "5% of the USDC amount bet across creator markets.",
    },
    Revenue: {
      'Normal Markets Fees To Protocol': "Protocol share of market fees: 5% on normal and leverage markets.",
      'Creator Markets Fees To Protocol': "Protocol share of market fees: 2.5% on creator markets.",
    },
    SupplySideRevenue: {
      'Creator Markets Fees To Creators': "Creator share of creator market fees.",
    },
  },
};

export default adapter;
