import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getObject, queryEvents } from "../../helpers/sui";

const CLMM_SWAP_EVENT =
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

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const events = await queryEvents({
    eventType: CLMM_SWAP_EVENT,
    options,
  });

  const dailyVolume = options.createBalances();

  const uniquePoolIds = [...new Set(events.map((e: any) => e.pool_id))];
  const poolObjects = await Promise.all(uniquePoolIds.map((id: string) => getObject(id)));
  const poolCache: Record<string, { coinX: string; coinY: string }> = {};
  uniquePoolIds.forEach((id, i) => {
    poolCache[id] = parsePoolType(poolObjects[i].type);
  });

  for (const event of events) {
    const { pool_id, amount_x, amount_y, x_for_y } = event;
    const { coinX, coinY } = poolCache[pool_id];

    if (x_for_y) {
      dailyVolume.add(coinX, amount_x);
    } else {
      dailyVolume.add(coinY, amount_y);
    }
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
};

export default adapter;
