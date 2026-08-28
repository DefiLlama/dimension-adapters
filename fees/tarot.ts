import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const yieldPool = "https://yields.llama.fi/pools";

interface IYield {
  apyBase: number;
  project: string;
  tvlUsd: number;
  chain: string;
};

const fetch = async (options: FetchOptions) => {
  const poolsCall: IYield[] = (await fetchURL(yieldPool))?.data;
  const pools = poolsCall
    .filter((e: IYield) => e.project === "tarot")
    .filter((e: IYield) => e.chain.toLowerCase() === options.chain.toLowerCase());
  const fees = pools
    .map(pool => pool.tvlUsd * pool.apyBase / 100 / 365)
    .reduce((prev, curr) => prev + curr, 0) / .9;
  const revenue = fees * .1;
  return {
    dailyFees: fees.toString(),
    dailyRevenue: revenue.toString(),
  };
};


const adapter: Adapter = {
  fetch,
  chains: [CHAIN.FANTOM, CHAIN.OPTIMISM],
  runAtCurrTime: true,
}

export default adapter;
