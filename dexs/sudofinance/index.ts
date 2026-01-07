import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.SUI]: "https://api.zofinance.io/volume?protocol=sudo"
}

interface IVolume {
  totalVolume: number,
  dailyVolume: number,
}

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const volume: IVolume = (await fetchURL(`${url[options.chain]}&timestamp=${options.startOfDay}`));
  return {
    dailyVolume: `${volume?.dailyVolume}`,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SUI],
  fetch,
  start: '2024-01-05',
};

export default adapter;
