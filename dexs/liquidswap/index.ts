import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const MODULE_ACCOUNT = "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12";
const MODULE_ACCOUNT_V05 = "0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    WITH raw AS (
      SELECT
        block_time,
        json_parse(data) AS event_json,
        event_type
      FROM aptos.events
      WHERE account_address IN ('${MODULE_ACCOUNT}', '${MODULE_ACCOUNT_V05}')
        AND event_type LIKE '%SwapEvent%'
        AND TIME_RANGE
    )
    SELECT
      COALESCE(SUM(
        TRY_CAST(json_extract_scalar(event_json, '$.x_out') AS DOUBLE) +
        TRY_CAST(json_extract_scalar(event_json, '$.y_out') AS DOUBLE)
      ), 0) AS daily_volume
    FROM raw
  `;

  const data = await queryDuneSql(options, query);
  return { dailyVolume: data[0]?.daily_volume ?? 0 };
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
