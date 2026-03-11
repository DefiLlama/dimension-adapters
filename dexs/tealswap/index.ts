import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://sbb.sooho.io/api/v1/dex/248/dashboard"

interface IRawData {
  timestamps: number[];
  volumes: number[];
}
interface IVolumeall {
  volume: number;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const rawData: IRawData = (await fetchURL(historicalVolumeEndpoint));
  const historicalVolume: any[] = rawData.timestamps.map((value: number, index: number) => {
    return {
      volume: rawData.volumes[index] || 0,
      time: value / 1000
    } as IVolumeall
  })

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.time * 1000)) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OAS]: {
      fetch,
      start: '2022-12-14',
    },
  },
};

export default adapter;
