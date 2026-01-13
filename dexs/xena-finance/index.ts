import { Adapter, Dependencies, FetchOptions } from "../../adapters/types"
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const query = `
    WITH swap_volumes AS (
        SELECT
            BYTEARRAY_TO_UINT256(SUBSTR(l.data, 65, 32)) / 1e30 AS amountIn,
            l.block_time AS time
        FROM base.logs l
        WHERE l.contract_address = 0x22787c26bb0ab0d331eb840ff010855a70a0dca6
          AND l.topic0 = 0xb24b74123b08b3e5d2af6b47e948b1c8eed24d9f717f27a4b2fc3aa82699696e
    )
    SELECT
        SUM(amountIn) AS swap
    FROM swap_volumes
    WHERE DATE_TRUNC('day', time) = DATE(FROM_UNIXTIME(${timestamp}));
  `;

  const result = await queryDuneSql(options, query);

  if (!result || result.length === 0) {
    return {
      dailyVolume: '0',
    };
  }

  const dailyVolume = Number(result[0].swap || 0);

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
