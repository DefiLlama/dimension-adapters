import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// DeDust deprecated the v3 GraphQL `pools { volume }` schema; the endpoint
// still responds but returns an empty `pools` array regardless of filter,
// so this adapter was reporting $0 volume since ~2026-04-21. The v4 REST
// endpoint (also used by `fees/dedust/index.ts`) is the canonical source
// and exposes `volume_24h_usd` per pool row.
const DEDUST_API = "https://mainnet.api.dedust.io/v4/api/get_pools";

const fetch = async (options: FetchOptions) => {
  let dailyVolume = 0;
  let offset = 0;

    while (true) {
      const apiResponse = await httpPost(DEDUST_API, {
        offset,
        limit: 100,
        sort_by: "volume_24h",
        sort_direction: "desc",
        filter_by_type: ["cpmm_v2", "stable", "cpmm_v1"],
      });

      const poolRows = Array.isArray(apiResponse?.pool_rows) ? apiResponse.pool_rows : [];
      let lastVolume = 0;
      for (const poolRow of poolRows) {
        const rowVolume = Number(poolRow?.volume_24h_usd ?? 0);
        if (!Number.isFinite(rowVolume)) continue;
        dailyVolume += rowVolume;
        lastVolume = rowVolume;
      }

      // Pools are sorted by volume descending — stop as soon as the tail
      // drops below $1 to avoid paginating thousands of dormant pools.
      if (lastVolume < 1) break;

      const totalPools = Number(apiResponse?.total_count ?? 0);
      if (!Number.isFinite(totalPools) || totalPools <= 0) break;
      offset += 100;
      if (offset >= totalPools) break;
      await sleep(3000);
    }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TON]: {
      fetch,
      runAtCurrTime: true,
      start: "2023-04-19",
    },
  },
};

export default adapter;
