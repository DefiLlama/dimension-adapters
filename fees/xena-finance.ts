import { Adapter, Dependencies, FetchOptions } from "../adapters/types"
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from "../helpers/dune"


const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const query = `
    WITH prices AS (
      SELECT
        token,
        call_block_number AS block_number,
        MAX(output_0) AS price
      FROM xena_base.Oracle_call_getPrice
      GROUP BY token, call_block_number
    ),
    fees AS (
      SELECT
        CAST(feeValue AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_IncreasePosition

      UNION ALL
      SELECT
        CAST(feeValue AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_DecreasePosition

      UNION ALL
      SELECT
        CAST(feeValue AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_LiquidatePosition

      UNION ALL
      SELECT
        CAST(fee * price AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_Swap
      JOIN prices
        ON prices.block_number = evt_block_number
       AND prices.token = tokenIn

      UNION ALL
      SELECT
        CAST(fee * price AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_LiquidityAdded
      JOIN prices
        ON prices.block_number = evt_block_number
       AND prices.token = xena_base.Pool_evt_LiquidityAdded.token

      UNION ALL
      SELECT
        CAST(fee * price AS DECIMAL) AS feeValue,
        evt_block_time
      FROM xena_base.Pool_evt_LiquidityRemoved
      JOIN prices
        ON prices.block_number = evt_block_number
       AND prices.token = xena_base.Pool_evt_LiquidityRemoved.token
    )

    SELECT
      SUM(feeValue) / 1e30 AS daily_fees
    FROM fees
    WHERE DATE_TRUNC('day', evt_block_time) = DATE_TRUNC('day', FROM_UNIXTIME(${timestamp}))
  `;

  const result = await queryDuneSql(options, query);

  if (!result || result.length === 0) {
    return {
      dailyFees: '0',
      dailyUserFees: '0',
      dailyRevenue: '0',
      dailyProtocolRevenue: '0',
      dailySupplySideRevenue: '0',
    };
  }

  const dailyFee = result[0].daily_fees || 0;

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: (dailyFee * 0.5).toString(),
    dailyProtocolRevenue: (dailyFee * 0.4).toString(),
    dailySupplySideRevenue: (dailyFee * 0.5).toString(),
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'All mint, burn, margin, liquidation and swap fees are collected',
    UserFees: 'All mint, burn, margin, liquidation and swap fees are collected',
    Revenue: 'Revenue is 50% of the total fees, which goes to Treasury and is reserved for development',
    ProtocolRevenue: '40% of the total fees goes to Treasury'
  },
}

export default adapter
