import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


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
  [CHAIN.FLOW]: 747,
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000))

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
    const totalVolume = historicalVolume
      .filter(volItem => (new Date(volItem.timestamp).getTime()) <= dayTimestamp)
      .reduce((acc, { volDay }) => acc + Number(volDay), 0)

    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.timestamp).getTime()) === dayTimestamp)?.volDay
    
    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
}

const adapters: TAdapter = {};
for (const chain in chains) {
  let startTime = 1727107200;
  if (chains.hasOwnProperty(chain)) {
    adapters[chain] = {
      fetch: fetch,
      start: startTime,
      customBackfill: customBackfill(chain, () => fetch)
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: adapters,
  version: 2,
};

export default adapter;
