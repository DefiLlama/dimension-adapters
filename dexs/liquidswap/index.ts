import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const MODULE_ACCOUNT = "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12";
const MODULE_ACCOUNT_V05 = "0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e";

const SWAP_EVENT_V0 = `${MODULE_ACCOUNT}::liquidity_pool::SwapEvent`;
const SWAP_EVENT_V05 = `${MODULE_ACCOUNT_V05}::liquidity_pool::SwapEvent`;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const query = `
    WITH raw AS (
      SELECT
        data
      FROM aptos.events
      WHERE event_type LIKE '%::liquidity_pool::SwapEvent%'
        AND (
          event_type LIKE '%${MODULE_ACCOUNT}%'
          OR event_type LIKE '%${MODULE_ACCOUNT_V05}%'
        )
        AND block_date >= from_unixtime(${startTimestamp})
        AND block_date < from_unixtime(${endTimestamp})
    )
    SELECT
      COALESCE(SUM(
        TRY_CAST(json_extract_scalar(data, '$.x_out') AS DOUBLE) +
        TRY_CAST(json_extract_scalar(data, '$.y_out') AS DOUBLE)
      ), 0) AS daily_volume
    FROM raw
  `;

  const result = await queryDuneSql(options, query);
  return { dailyVolume: result?.[0]?.daily_volume ?? 0 };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: '2022-11-20',
};

export default adapter;
