import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = (chain_id: number) => `https://api.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000`

interface IVolumeall {
  volDay: number;
  chainId: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: number;
};

const chains: TChains =  {
  [CHAIN.BSC]: 56,
  [CHAIN.ERA]: 324,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[chain])))?.data.data;
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


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async  () => 1680739200,
      customBackfill: customBackfill(CHAIN.BSC as Chain, fetch)
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: async  () => 1680739200,
      customBackfill: customBackfill(CHAIN.ERA as Chain, fetch)
    },
  },
};

export default adapter;
