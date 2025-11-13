import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await queryDuneSql(
    options,
    `
    WITH jetton_query AS (
      SELECT
        trace_id,
        block_time,
        block_date,
        MAX(query_id) AS query_id
      FROM ton.jetton_events
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
      GROUP BY trace_id, block_time, block_date
    )
    SELECT
      SUM(dt.volume_usd) as volume_usd
    FROM ton.dex_trades AS dt
    LEFT JOIN jetton_query AS je
      ON dt.trace_id = je.trace_id
      AND dt.block_time = je.block_time
    WHERE
      BITWISE_RIGHT_SHIFT(COALESCE(dt.query_id, je.query_id), 32) = 988556692
      AND dt.block_time >= from_unixtime(${options.startTimestamp})
      AND dt.block_time < from_unixtime(${options.endTimestamp});
  `,
  );

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);

  return {
    dailyVolume: chainData.volume_usd || "0",
  };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: "2025-03-14",
  methodology: {
    dailyVolume:
      "Volume is calculated by summing the USD volume of all trades routed through the DeDust aggregator that day.",
  },
  chains: [CHAIN.TON],
};

export default adapter;
