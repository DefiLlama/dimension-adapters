import fetchURL from "../../utils/fetchURL"
import { Chain, FetchOptions } from "../../adapters/types";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const historicalVolumeEndpoint = (chain: string) => `https://analytics.bog-general-api.com/daily_volume?type=all&chain=${chain}`

interface IVolumeall {
  dailyVolume: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: string;
};

const chains: TChains = {
  [CHAIN.BSC]: 'bsc',
  [CHAIN.AVAX]: 'avax',
  [CHAIN.FANTOM]: 'ftm',
  [CHAIN.POLYGON]: 'matic',
  [CHAIN.CRONOS]: 'cro'
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[options.chain])));

  const dailyVolume = historicalVolume
    .find(dayItem => Math.floor(Number(dayItem.timestamp) / 1000) === options.startOfDay)?.dailyVolume

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: Object.keys(chains),
};

export default adapter;
