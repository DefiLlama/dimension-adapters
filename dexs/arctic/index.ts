import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (chain_id: number) => `https://izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000`

interface IVolumeall {
  volDay: number;
  chainId: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: number;
};

const chains: TChains =  {
  [CHAIN.AURORA]: 1313161554,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[chain])))?.data;
    const historicalVolume = historical.filter(e => e.chainId === chains[chain]);
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
};

const getStartTimestamp = async (chain_id: number) => {
  const historical: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chain_id)))?.data;
  const historicalVolume = historical.filter(e => e.chainId === chain_id);
  return (new Date(historicalVolume[historicalVolume.length - 1].timestamp).getTime());
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AURORA]: {
      fetch: fetch(CHAIN.AURORA),
      start: () => getStartTimestamp(chains[CHAIN.AURORA]),
      customBackfill: customBackfill(CHAIN.AURORA as Chain, fetch)
    },
  },
};

export default adapter;
