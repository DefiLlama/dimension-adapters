import { Dependencies, FetchOptions, FetchResult, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_1: any, _2: any, options: FetchOptions): Promise<FetchResult> => {
  const query = `
    WITH table_a AS (
        SELECT
            LEAST(
              COALESCE(
                TRY_CAST(json_value(data,'lax $.input_amount_usd') AS DOUBLE),
                TRY_CAST(json_value(TRY_CAST(json_value(data,'lax $.extra_data') AS VARCHAR),'lax $.amountInUsd') AS DOUBLE)
              ),
              COALESCE(
                TRY_CAST(json_value(data,'lax $.output_amount_usd') AS DOUBLE),
                TRY_CAST(json_value(TRY_CAST(json_value(data,'lax $.extra_data') AS VARCHAR),'lax $.amountOutUsd') AS DOUBLE)
              )
            ) AS tx_value_usd
        FROM aptos.events AS e
        WHERE (
            e.event_type = '0x2e8671ebdf16028d7de00229c26b551d8f145d541f96278eec54d9d775a49fe3::router::SwapEvent'
            OR e.event_type = '0x59b8a7918da8ba9d98ded64d49519ec889d311a515c61b06abc1aaa42c508fae::router::SwapEvent'
            OR e.event_type = '0x165287033a77aa487c547a486a619de3a12099cff98a63bb0352a411772b7e73::router::SwapEvent'
            OR e.event_type = '0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::SwapEvent'
          )
          AND e.tx_version NOT IN (
            1002108310,1001748840,1001765227,1001624974,1001809346,1002110994,
            1002041129,1002041841,1001720818,1001719551,1001718924,1001751891,
            1001760947,1001749166,1001750827,1001750564,1001752517,1001812177,
            1001748059,1001820233,1001811399,1001762548,1001749445,1001670382,
            1001675112,1001967617,1002038932,1001811791,1001820520,1001751178,
            1001748578,1001812467,1001620076,1082187676,1082197658,1082197383,
            1082197246,1082197771,1082189106,1082188929
          )
          AND e.tx_success = TRUE
          AND e.block_date >= from_unixtime(${options.startTimestamp})
          AND e.block_date <= from_unixtime(${options.endTimestamp})
    )
    SELECT
        SUM(tx_value_usd) AS total_volume
    FROM table_a;
  `
  const chainData = await queryDuneSql(options, query)

  return {
    dailyVolume: chainData[0]["total_volume"],
  };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: '2023-06-16',
    }
  },
  isExpensiveAdapter: true,
};

export default adapter;
