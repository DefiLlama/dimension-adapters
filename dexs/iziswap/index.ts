import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = (chain_id: number, page: number) => `https://api.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000&page=${page}`

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
  [CHAIN.BSC]: 56,
  [CHAIN.ERA]: 324,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.METER]: 82,
  [CHAIN.AURORA]: 1313161554,
  [CHAIN.POLYGON]: 137,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.ONTOLOGY_EVM]: 58,
  [CHAIN.ULTRON]: 1231,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.BASE]: 8453,
  [CHAIN.MANTA]: 169,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    let isSuccess = true;
    let page = 1;
    const historical: IVolumeall[] = [];
    while (isSuccess) {
      const response = (await fetchURL(historicalVolumeEndpoint(chains[chain], page)));
      if (response.is_success){
        Array.prototype.push.apply(historical, response.data);
        page += 1;
      } else {
        isSuccess = false;
      };
    };
    const historicalVolume = historical.filter(e => e.chainId === chains[chain]);
    const totalVolume = historicalVolume
      .filter(volItem => (new Date(volItem.timestamp).getTime()) <= dayTimestamp)
      .reduce((acc, { volDay }) => acc + Number(volDay), 0)

    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.timestamp).getTime()) === dayTimestamp)?.volDay

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  }
};

const adapters: TAdapter = {};
for (const chain in chains) {
  let startTime = 1689523200;
  if (chain == CHAIN.BSC || chain == CHAIN.ERA){
    startTime = 1680739200;
  };
  if (chain === CHAIN.AURORA) startTime = 1665446400;
  if (chains.hasOwnProperty(chain)) {
    adapters[chain] = {
      fetch: fetch(chain),
      start: startTime,
      customBackfill: customBackfill(chain, fetch)
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: adapters
};

export default adapter;
