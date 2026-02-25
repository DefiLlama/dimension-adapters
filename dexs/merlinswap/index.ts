import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const historicalVolumeEndpoint = (chain_id: number, page: number) => `https://api-dass.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000&page=${page}`

interface IVolumeall {
  volDay: number;
  chainId: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: number;
};
type TAdapter = {
  [key:string]: any;
};

const chains: TChains =  {
  [CHAIN.MERLIN]: 4200,
};

const fetch = async (_t: any, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
  let isSuccess = true;
    let page = 1;
    const historical: IVolumeall[] = [];
    while (isSuccess) {
      const response = (await fetchURL(historicalVolumeEndpoint(chains[options.chain], page)));
      if (response.is_success){
        Array.prototype.push.apply(historical, response.data);
        page += 1;
      } else {
        isSuccess = false;
      };
    };
    const historicalVolume = historical.filter(e => e.chainId === chains[options.chain]);
    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.timestamp).getTime()) === options.startOfDay)?.volDay

    return {
      dailyVolume: dailyVolume,
    };
}

const adapters: TAdapter = {};
for (const chain in chains) {
  if (chains.hasOwnProperty(chain)) {
    adapters[chain] = {
      fetch: fetch,
      start: 1706946000,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: adapters,
  version: 1,
};

export default adapter;
