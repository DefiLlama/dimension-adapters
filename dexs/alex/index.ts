import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://alexgo-io.metabaseapp.com/api/public/dashboard/66cca0ba-7735-46c5-adfb-d80535506f4a/dashcard/464/card/496?parameters=%5B%5D"

interface IVolumeall {
  volume: string;
  time: string;
}


const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint)).data.rows;
  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, volume] = e;
    return {
      time,
      volume
    };
  });

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.time).getTime() / 1000) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
    },
  },
};

export default adapter;
