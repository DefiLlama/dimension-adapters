import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getObject } from "../../helpers/sui";

const SWAP_EVENT =
  "0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d::pool::Swap";

function parsePoolType(type: string): { coinX: string; coinY: string } {
  const start = type.indexOf("<");
  const end = type.lastIndexOf(">");
  if (start === -1 || end === -1)
    throw new Error(`Cannot parse pool type: ${type}`);
  const inner = type.substring(start + 1, end);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "<") depth++;
    else if (inner[i] === ">") depth--;
    else if (inner[i] === "," && depth === 0) {
      return {
        coinX: inner.substring(0, i).trim(),
        coinY: inner.substring(i + 1).trim(),
      };
    }
  }
  throw new Error(`Cannot find type separator in pool type: ${type}`);
}

const poolCache: Record<string, { coinX: string; coinY: string }> = {};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const query = `
    SELECT
      json_extract_scalar(event_json, '$.pool_id') as pool_id,
      SUM(CASE WHEN json_extract_scalar(event_json, '$.x_for_y') = 'true'
        THEN CAST(json_extract_scalar(event_json, '$.amount_x') AS DECIMAL(38,0))
        ELSE 0 END) as volume_x,
      SUM(CASE WHEN json_extract_scalar(event_json, '$.x_for_y') = 'false'
        THEN CAST(json_extract_scalar(event_json, '$.amount_y') AS DECIMAL(38,0))
        ELSE 0 END) as volume_y
    FROM sui.events
    WHERE event_type = '${SWAP_EVENT}'
      AND date >= from_unixtime(${options.startTimestamp})
      AND date <= from_unixtime(${options.endTimestamp})
      AND timestamp_ms >= ${options.startTimestamp * 1000}
      AND timestamp_ms < ${options.endTimestamp * 1000}
    GROUP BY 1
  `;

  const results: any[] = await queryDuneSql(options, query);
  const dailyVolume = options.createBalances();

  // Resolve pool types for uncached pools via Sui RPC
  const newPoolIds = results
    .map((r: any) => r.pool_id)
    .filter((id: string) => id && !poolCache[id]);

  if (newPoolIds.length > 0) {
    const poolResults = await Promise.allSettled(
      newPoolIds.map((id: string) => getObject(id))
    );
    newPoolIds.forEach((id: string, i: number) => {
      const result = poolResults[i];
      if (result.status === "fulfilled" && result.value?.type) {
        try {
          poolCache[id] = parsePoolType(result.value.type);
        } catch (e: any) {
          console.error(`[flowx-v3] Failed to parse pool type for ${id}: ${e?.message}`);
        }
      }
    });
  }

  for (const row of results) {
    const pool = poolCache[row.pool_id];
    if (!pool) continue;
    if (row.volume_x > 0) dailyVolume.add(pool.coinX, String(row.volume_x));
    if (row.volume_y > 0) dailyVolume.add(pool.coinY, String(row.volume_y));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-05-10",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
