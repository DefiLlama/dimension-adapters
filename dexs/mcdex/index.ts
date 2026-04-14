import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://stats.mux.network/api/public/dashboard/e1134798-4660-489f-a45a-45d9adb05918/dashcard/14/card/15?parameters=[]"

interface IVolumeall {
  volume: string;
  time: string;
  title: string;
}

type chains = {
  [chain: string | Chain]: string;
}

const chainsMap: chains = {
  [CHAIN.ARBITRUM]: "Trading - Arbitrum",
  [CHAIN.AVAX]: "Trading - Avalanche",
  [CHAIN.BSC]: "Trading - BSC",
  [CHAIN.FANTOM]: "Trading - Fantom"
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.rows;

    const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
      const [time, title, volume] = e;
      return {
        time,
        volume,
        title
      } as IVolumeall;
    });

    const historical = historicalVolume.filter((e: IVolumeall)  => e.title === chainsMap[chain]);
    const dailyVolume = historical
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.time)) === dayTimestamp)?.volume

    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(chainsMap).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
      }
    }
  }, {})
};

export default adapter;
