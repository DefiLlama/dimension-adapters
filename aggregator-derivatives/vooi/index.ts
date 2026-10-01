import fetchURL, { httpGet } from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import asyncRetry from "async-retry";

const ULTRA_STATS_START = "2026-10-01";
const ULTRA_STATS_START_TS = Math.floor(new Date(ULTRA_STATS_START).getTime() / 1000);
const LEGACY_DEAD_FROM = new Date((ULTRA_STATS_START_TS - 86400) * 1000).toISOString().slice(0, 10);

async function fetchLegacyStatistics(startOfDay: number) {
  const data = await asyncRetry(
    async () => fetchURL(`https://vooi-rebates.fly.dev/defillama/volumes?ts=${startOfDay}`),
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
    },
  );
  return data.map((item: any) => ({
    ...item,
    dailyVolume: Number(item.dailyVolume),
  }));
}

async function fetchUltraStatistics(options: FetchOptions) {
  const res = await httpGet(
    `https://ultra.vooi.io/api/ultra/public-statistics?timestamp=${options.startOfDay}`,
  );
  if (res?.date !== options.dateString) {
    throw new Error(`VOOI ultra stats: expected date ${options.dateString}, got ${res?.date}`);
  }
  const volume = Number(res.volume);
  if (res.volume === null || res.volume === undefined || !Number.isFinite(volume)) {
    throw new Error(`VOOI ultra stats: no volume for ${options.dateString}`);
  }
  return volume;
}

const getItems: Record<string, (items: Array<any>) => Array<any>> = {
  [CHAIN.ARBITRUM]: (items: Array<any>): Array<any> => {
    return items.filter(
      (item) =>
        ["ostium"].includes(item.protocol) ||
        (["gmx", "gains", "synfutures"].includes(item.protocol) && item.network === "arbitrum"),
    );
  },
  [CHAIN.ORDERLY]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol === "orderly");
  },
  [CHAIN.HYPERLIQUID]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol === "hyperliquid");
  },
  [CHAIN.BSC]: (items: Array<any>): Array<any> => {
    return items.filter(
      (item) => item.protocol == "kiloex" && (item.network === "bnb" || item.network === null),
    );
  },
  [CHAIN.BASE]: (items: Array<any>): Array<any> => {
    return items.filter(
      (item) => ["synfutures", "kiloex"].includes(item.protocol) && item.network === "base",
    );
  },
  [CHAIN.BLAST]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol == "kiloex" && item.network === "blast");
  },
  [CHAIN.TAIKO]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol == "synfutures" && item.network === "taiko");
  },
  [CHAIN.MANTA]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol == "kiloex" && item.network === "manta");
  },
  [CHAIN.OP_BNB]: (items: Array<any>): Array<any> => {
    return items.filter((item) => item.protocol == "kiloex" && item.network === "opbnb");
  },
  [CHAIN.OFF_CHAIN]: (items: Array<any>): Array<any> => {
    return items.filter((item) => ["aster", "lighter"].includes(item.protocol));
  },
};

const isUltraStatsPeriod = (options: FetchOptions) => options.startOfDay >= ULTRA_STATS_START_TS;

const prefetch = async (options: FetchOptions): Promise<any> => {
  if (isUltraStatsPeriod(options)) return null;
  return await fetchLegacyStatistics(options.startOfDay);
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (isUltraStatsPeriod(options)) {
    if (options.chain !== CHAIN.OFF_CHAIN)
      throw new Error(`VOOI: ${options.chain} is not reported after ${LEGACY_DEAD_FROM}`);
    const dailyVolume = await fetchUltraStatistics(options);
    return { dailyVolume };
  }

  const items = getItems[options.chain](options.preFetchedResults);

  let dailyVolume = 0;
  for (const item of items) {
    if (
      options.chain === CHAIN.ARBITRUM &&
      options.startOfDay === 1768003200 &&
      item.protocol === "ostium"
    ) {
      dailyVolume += 0;
    } else {
      dailyVolume += item.dailyVolume;
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-05-02",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.ORDERLY]: {
      start: "2024-05-02",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.BSC]: {
      start: "2024-06-01",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.BASE]: {
      start: "2024-08-01",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.HYPERLIQUID]: {
      start: "2024-11-04",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.TAIKO]: {
      start: "2025-10-20",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.MANTA]: {
      start: "2025-10-20",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.BLAST]: {
      start: "2025-10-20",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.OP_BNB]: {
      start: "2025-10-20",
      deadFrom: LEGACY_DEAD_FROM,
    },
    [CHAIN.OFF_CHAIN]: {
      start: "2025-11-01",
    },
  },
  doublecounted: true,
  methodology: {
    Volume: `Taker perpetual volume routed through VOOI. Until ${ULTRA_STATS_START} it is reported per underlying venue chain from the legacy VOOI endpoint; from ${ULTRA_STATS_START} the total ultra volume across all venues is reported under off_chain from the VOOI ultra statistics API. Volume is already counted in the underlying venue adapters.`,
  },
};

export default adapter;
