import { FeeAdapter } from "../utils/adapters.type";
import { BSC, FANTOM, OPTIMISM } from "../helpers/chains";
import { fetchURL } from "@defillama/adapters/projects/helper/utils";
import { CHAIN } from "@defillama/adapters/volumes/helper/chains";

const yieldPool = "https://yields.llama.fi/pools";

interface IYield {
  apyBase: number;
  project: string;
  tvlUsd: number;
  chain: string;
};

const graphs = () => {
  return (chain: CHAIN) => {
    return async (timestamp: number) => {
      const poolsCall: IYield[] = (await fetchURL(yieldPool))?.data.data;
      const pools = poolsCall
        .filter((e: IYield) => e.project === "tarot")
        .filter((e: IYield) => e.chain.toLowerCase() === chain.toLowerCase());
      const fees = pools
        .map(pool => pool.tvlUsd * pool.apyBase / 100 / 365)
        .reduce((prev, curr) => prev + curr, 0) / .9;
      const revenue = fees * .1;
      return {
        timestamp,
        totalFees: "0" ,
        dailyFees: fees.toString(),
        totalRevenue: "0",
        dailyRevenue: revenue.toString(),
      };
    };
  }
};


const adapter: FeeAdapter = {
  fees: {
    [FANTOM]: {
        fetch: graphs()(CHAIN.FANTOM),
        runAtCurrTime: true,
        start: async () => 0,
    },
    [OPTIMISM]: {
      fetch: graphs()(CHAIN.OPTIMISM),
      runAtCurrTime: true,
      start: async () => 0,
  },
  },
}

export default adapter;
