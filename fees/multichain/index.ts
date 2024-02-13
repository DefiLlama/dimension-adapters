import { Adapter } from "../../adapters/types";
// import { BSC, FANTOM, OPTIMISM } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const stableStatsUrl = "https://bridgeapi.anyswap.exchange/data/stats/stable";
const statsUrl = "https://bridgeapi.anyswap.exchange/data/stats";

interface IStats {
  h24fee: string;
  allfee: string;
};

const fetch = async (timestamp: number) => {
  const stats: IStats[] = (await Promise.all([fetchURL(stableStatsUrl),fetchURL(statsUrl)]))
  const fees = stats.reduce((prev: number, curr: IStats) => prev +  Number(curr.h24fee), 0);
  const totalFees = stats.reduce((prev: number, curr: IStats) => prev +  Number(curr.allfee), 0);
  return {
    timestamp,
    totalFees: totalFees.toString(),
    dailyFees: fees.toString(),
    totalRevenue: "0",
    dailyRevenue: "0",
  };
};


const adapter: Adapter = {
  adapter: {
    ["anyswap"]: {
        fetch: fetch,
        runAtCurrTime: true,
        start: 0,
    },
  },
}

export default adapter;
