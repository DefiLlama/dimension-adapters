import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = (chain: string) => `https://analytics.bog-general-api.com/daily_volume?type=all&chain=${chain}`

interface IVolumeall {
  dailyVolume: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: string;
};

const chains: TChains =  {
  [CHAIN.BSC]: 'bsc',
  [CHAIN.AVAX]: 'avax',
  [CHAIN.FANTOM]: 'ftm',
  [CHAIN.POLYGON]: 'matic',
  [CHAIN.CRONOS]: 'cro'
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[chain])));
    const totalVolume = historicalVolume
      .filter(volItem => Math.floor(Number(volItem.timestamp)/1000) <= dayTimestamp)
      .reduce((acc, { dailyVolume }) => acc + Number(dailyVolume), 0)

    const dailyVolume = historicalVolume
      .find(dayItem => Math.floor(Number(dayItem.timestamp)/1000) === dayTimestamp)?.dailyVolume

    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  }
};

const getStartTimestamp = async (chain: string) => {
  const historical: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[chain])));
  return (new Date(historical[0].timestamp).getTime() / 1000);
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(chains).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
        start: () => getStartTimestamp(chain)
      }
    }
  }, {})
};

export default adapter;
