import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const LIQUIDSWAP_SWAP_EVENT_PREFIXES = [
  "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12::liquidity_pool::SwapEvent<",
  "0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::liquidity_pool::SwapEvent<",
];

// Existing dashboard history currently ends at 2025-10-21 from the old Pontem/Sentrio source.
const START_DATE = "2025-10-22";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const eventFilters = LIQUIDSWAP_SWAP_EVENT_PREFIXES
    .map((prefix) => `event_type LIKE '${prefix}%'`)
    .join(" OR ");

  const query = `
    WITH raw_swaps AS (
      SELECT
        TRIM(REGEXP_EXTRACT(event_type, 'SwapEvent<([^,]+), *([^,]+),', 1)) AS token_x,
        TRIM(REGEXP_EXTRACT(event_type, 'SwapEvent<([^,]+), *([^,]+),', 2)) AS token_y,
        TRY_CAST(JSON_EXTRACT_SCALAR(JSON_PARSE(data), '$.x_in') AS DECIMAL(38, 0)) AS x_in,
        TRY_CAST(JSON_EXTRACT_SCALAR(JSON_PARSE(data), '$.y_in') AS DECIMAL(38, 0)) AS y_in
      FROM aptos.events
      WHERE block_date >= FROM_UNIXTIME(${options.startTimestamp})
        AND block_date < FROM_UNIXTIME(${options.endTimestamp})
        AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
        AND block_time < FROM_UNIXTIME(${options.endTimestamp})
        AND tx_success = TRUE
        AND (${eventFilters})
    ),
    volume_by_token AS (
      SELECT token_x AS token, SUM(COALESCE(x_in, 0)) AS amount
      FROM raw_swaps
      GROUP BY 1

      UNION ALL

      SELECT token_y AS token, SUM(COALESCE(y_in, 0)) AS amount
      FROM raw_swaps
      GROUP BY 1
    )
    SELECT
      token,
      CAST(SUM(amount) AS VARCHAR) AS amount
    FROM volume_by_token
    WHERE token IS NOT NULL
    GROUP BY 1
    HAVING SUM(amount) > 0
  `;

  const dailyVolume = options.createBalances();
  const rows: { token: string; amount: string }[] = await queryDuneSql(options, query);

  rows.forEach(({ token, amount }) => dailyVolume.add(token, amount));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: START_DATE,
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
