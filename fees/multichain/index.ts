import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const stableStatsUrl = "https://bridgeapi.anyswap.exchange/data/stats/stable";
const statsUrl = "https://bridgeapi.anyswap.exchange/data/stats";

interface IStats {
  h24fee: string;
  allfee: string;
};

const fetch = async (_options: FetchOptions) => {
  const stats: IStats[] = (await Promise.all([fetchURL(stableStatsUrl), fetchURL(statsUrl)]))
  const fees = stats.reduce((prev: number, curr: IStats) => prev + Number(curr.h24fee), 0);

  return {
    dailyFees: fees,
    dailyRevenue: "0",
  };
};


const adapter: Adapter = {
  version: 1,
  fetch,
  chains: ['anyswap'],
  runAtCurrTime: true,
}

export default adapter;
