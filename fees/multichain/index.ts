import { Adapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const stableStatsUrl = "https://bridgeapi.anyswap.exchange/data/stats/stable";
const statsUrl = "https://bridgeapi.anyswap.exchange/data/stats";

interface IStats {
  h24fee: string;
  allfee: string;
};

const fetch = async (timestamp: number) => {
  const stats: IStats[] = (await Promise.all([fetchURL(stableStatsUrl),fetchURL(statsUrl)]))
  const fees = stats.reduce((prev: number, curr: IStats) => prev +  Number(curr.h24fee), 0);
  return {
    timestamp,
    dailyFees: fees,
    dailyRevenue: "0",
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    ["anyswap"]: {
        fetch: fetch,
        runAtCurrTime: true,
            },
  },
}

export default adapter;
