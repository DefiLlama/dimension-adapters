import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STATS_URL = "https://inoswap.org/api/stats";

const fetch = async () => {
  const stats: any = await fetchURL(STATS_URL);
  const dailyVolume = Number(stats?.totalVolumeUsd || 0);

  return {
    dailyVolume: dailyVolume.toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      runAtCurrTime: true,
      start: "2026-02-01",
    },
  },
};

export default adapter;
