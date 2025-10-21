import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import asyncRetry from "async-retry";

async function fetchStatistics(startOfDay: number) {
  const data = await asyncRetry(
    async () =>
      fetchURL(
        `https://vooi-rebates.fly.dev/defillama/volumes?ts=${startOfDay}`
      ),
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
    }
  );
  return data.map((item) => ({
    ...item,
    dailyVolume: Number(item.dailyVolume),
  }));
}

const fetchArbitrum = async (
  _a: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const data = await fetchStatistics(options.startOfDay);
  const dailyVolume = data.reduce((acc, item) => {
    if (item.protocol == "ostium") {
      acc += item.dailyVolume;
    }
    if (item.protocol == "gmx" && item.network == "arbitrum") {
      acc += item.dailyVolume;
    }
    if (item.protocol == "gains" && item.network == "arbitrum") {
      acc += item.dailyVolume;
    }
    if (item.protocol == "synfutures") {
      acc += item.dailyVolume;
    }
    return acc;
  }, 0);
  return { dailyVolume };
};
const fetchOptimism = async (
  _a: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const data = await fetchStatistics(options.startOfDay);
  const dailyVolume = data.reduce((acc, item) => {
    if (item.protocol == "orderly") {
      acc += item.dailyVolume;
    }
    return acc;
  }, 0);
  return { dailyVolume };
};
const fetchHyperliquid = async (
  _a: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const data = await fetchStatistics(options.startOfDay);
  const dailyVolume = data.reduce((acc, item) => {
    if (item.protocol == "hyperliquid") {
      acc += item.dailyVolume;
    }
    return acc;
  }, 0);
  return { dailyVolume };
};
const fetchBsc = async (
  _a: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const data = await fetchStatistics(options.startOfDay);
  const dailyVolume = data.reduce((acc, item) => {
    if (item.protocol == "kiloex" && item.network != "base") {
      acc += item.dailyVolume;
    }
    return acc;
  }, 0);
  return { dailyVolume };
};
const fetchBase = async (
  _a: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const data = await fetchStatistics(options.startOfDay);
  const dailyVolume = data.reduce((acc, item) => {
    if (item.protocol == "kiloex" && item.network === "base") {
      acc += item.dailyVolume;
    }
    return acc;
  }, 0);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchArbitrum,
      start: "2024-05-02",
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchOptimism,
      start: "2024-05-02",
    },
    [CHAIN.BSC]: {
      fetch: fetchBsc,
      start: "2024-06-01",
    },
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2024-08-01",
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2024-11-04",
    },
  },
  doublecounted: true,
};
export default adapter;
