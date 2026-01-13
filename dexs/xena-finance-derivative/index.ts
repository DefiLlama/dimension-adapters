import { Adapter, Dependencies, FetchOptions } from "../../adapters/types"
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const query = `
with perp_flows as (
    -- Increase Position
    SELECT
        CAST(
            varbinary_to_uint256(
                varbinary_substring(data, 97, 32)
            ) AS DECIMAL
        ) / 1e30 AS volume,
        block_time
    FROM base.logs
    WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
      AND topic0 = 0x8f1a004341b7c2e1e0799b80c6b849e04431c20757ba9b8c9064d5132405465d

    union all

    -- Decrease Position
    SELECT
        CAST(
            varbinary_to_uint256(
                varbinary_substring(data, 97, 32)
            ) AS DECIMAL
        ) / 1e30 AS volume,
        block_time
    FROM base.logs
    WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
      AND topic0 = 0x8b8cf2b995650a0e5239d131bc9ace3606d59971f1c0370675babdbc1fc48e5f

    union all

    -- Liquidate Position
    SELECT
        CAST(
            varbinary_to_uint256(
                varbinary_substring(data, 129, 32)
            ) AS DECIMAL
        ) / 1e30 AS volume,
        block_time
    FROM base.logs
    WHERE contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
      AND topic0 = 0x136cbd19b29e7d7cbbb67178581f238ef5029382a513cd55f0096e974441a6fb
)

select
    sum(volume) as daily_perp_volume
from perp_flows
WHERE date_trunc('day', block_time) = date(FROM_UNIXTIME(${timestamp}));
  `;

  const result = await queryDuneSql(options, query);

  if (!result || result.length === 0) {
    return {
      dailyVolume: '0',
    };
  }

  const dailyVolume = Number(result[0].daily_perp_volume || 0);

  return {
    dailyVolume: dailyVolume.toString(),
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
}

export default adapter;
