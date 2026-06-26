import fetchURL from "../../utils/fetchURL"
import { FetchOptions } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.SUI]: "https://api.turbos.finance/dex/volume"
}

interface IVolume {
  dailyVolume: number,
}

const fetch = async (options: FetchOptions) => {
  const volume: IVolume = (await fetchURL(url[options.chain]));
  return { dailyVolume: `${volume?.dailyVolume || undefined}` };
}



const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
  start: '2023-10-14',
};

export default adapter;
