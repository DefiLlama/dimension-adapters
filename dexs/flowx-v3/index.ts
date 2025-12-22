import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (
  _1: any,
  _2: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const query = `
    WITH flowx_swaps AS (
      SELECT
        date,
        (
          CASE
            WHEN CAST(json_extract_scalar(event_json, '$.x_for_y') AS BOOLEAN) = true
              THEN CAST(json_extract_scalar(event_json, '$.amount_x') AS DOUBLE)
            ELSE
              CAST(json_extract_scalar(event_json, '$.amount_y') AS DOUBLE)
          END
        ) / 1e9 AS volume_amount
      FROM sui.events
      WHERE
        package IN (
         0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d,
         0xba153169476e8c3114962261d1edc70de5ad9781b83cc617ecc8c1923191cae0
        )
        AND event_type LIKE '%Swap%'
        AND timestamp_ms >= ${options.startTimestamp * 1000}
        AND timestamp_ms < ${options.endTimestamp * 1000}
    )
    SELECT
      date,
      COALESCE(SUM(volume_amount), 0) AS daily_volume
    FROM flowx_swaps
    GROUP BY date
    ORDER BY date
  `;

  const data = await queryDuneSql(options, query);
  const dailyVolume = options.createBalances();

  data.forEach((day: any) => {
    if (!day.daily_volume || day.daily_volume <= 0) return;
    dailyVolume.addUSDValue(day.daily_volume);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-01-01",
  methodology: {
    Volume:
      "Daily trading volume calculated from FlowX swap events on Sui. Volume is derived from the input token amount (amount_x or amount_y) depending on swap direction, normalized by 1e9 decimals.",
  },
};

export default adapter;
