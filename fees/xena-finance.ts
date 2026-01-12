import { Adapter, Dependencies, FetchOptions } from "../adapters/types"
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from "../helpers/dune"


const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const query = `
    WITH raw_fees AS (

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 1, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0x8f1a004341b7c2e1e0799b80c6b849e04431c20757ba9b8c9064d5132405465d

      UNION ALL

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 1, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0x8b8cf2b995650a0e5239d131bc9ace3606d59971f1c0370675babdbc1fc48e5f

      UNION ALL

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 65, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0x136cbd19b29e7d7cbbb67178581f238ef5029382a513cd55f0096e974441a6fb

      UNION ALL

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 33, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0xb24b74123b08b3e5d2af6b47e948b1c8eed24d9f717f27a4b2fc3aa82699696e

      UNION ALL

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 65, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0x43c967b388d3a4ccad3f7ab80167852e322e5a3fde9893f530252281b2ae8b70

      UNION ALL

      SELECT
          varbinary_to_uint256(varbinary_substring(data, 65, 32)) / 1e30 AS fee,
          block_date
      FROM base.logs
      WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
        AND topic0 = 0xd765e08eef31c0983ecca03ecd166297ac485ecd5dd69e291c848f0a020333c1
    )

    SELECT
        SUM(fee) AS daily_fees
    FROM raw_fees
    WHERE date(block_date) = date(FROM_UNIXTIME(${timestamp}));

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

  const dailyFee = Number(result[0].daily_fees || 0) / 1e18;

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
