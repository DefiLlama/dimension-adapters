import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FAITH_STATS_URL = "https://faith.gg/api/stats/protocol";

interface FaithStats {
  current: {
    volumeUsd24h: string;
    feesUsd24h: string;
  };
}

const methodology = {
  Volume: "Total USD value of SUI deployed into Tests of Faith over the requested day window.",
  Fees: "10% protocol fee taken from deployed SUI during Tests of Faith over the requested day window.",
  Revenue: "All protocol fees collected by FAITH count as protocol revenue.",
};

const fetchFaithStats = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  // DeFiLlama passes unix timestamps (seconds). Your API now accepts these params.
  const url = `${FAITH_STATS_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`;
  const stats: FaithStats = await fetchURL(url);

  const dailyVolume = Number(stats.current.volumeUsd24h || 0);
  const dailyFees = Number(stats.current.feesUsd24h || 0);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchFaithStats,
      start: "2025-11-24",
    },
  },
  methodology,
};

export default adapter;
