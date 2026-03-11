import fetchURL from "../../utils/fetchURL"
import { Chain, FetchOptions } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historical: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[options.chain])))?.data;
  const historicalVolume = historical.filter(e => e.chainId === chains[options.chain]);

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.timestamp).getTime()) === dayTimestamp)?.volDay

  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AURORA]: {
      fetch,
    },
  },
};

export default adapter;
