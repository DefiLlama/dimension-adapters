import { Adapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

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
      const poolsCall: IYield[] = (await fetchURL(yieldPool))?.data;
      const pools = poolsCall
        .filter((e: IYield) => e.project === "tarot")
        .filter((e: IYield) => e.chain.toLowerCase() === chain.toLowerCase());
      const fees = pools
        .map(pool => pool.tvlUsd * pool.apyBase / 100 / 365)
        .reduce((prev, curr) => prev + curr, 0) / .9;
      const revenue = fees * .1;
      return {
        timestamp,
        dailyFees: fees.toString(),
        dailyRevenue: revenue.toString(),
      };
    };
  }
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch: graphs()(CHAIN.FANTOM),
        runAtCurrTime: true,
            },
    [CHAIN.OPTIMISM]: {
      fetch: graphs()(CHAIN.OPTIMISM),
      runAtCurrTime: true,
        },
  },
}

export default adapter;
