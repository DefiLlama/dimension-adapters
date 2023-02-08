import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://app.increment.fi/info/totalinfos"

interface IVolumeall {
  volume: string;
  time: string;
}


const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.vol;
  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, volume] = e;
    return {
      time,
      volume
    };
  });
  const totalVolume = historicalVolume
    .filter(volItem =>  getUniqStartOfTodayTimestamp(new Date(volItem.time)) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)
  const date = new Date(dayTimestamp * 1000);
  const todayDateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time === todayDateString)?.volume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.vol;
  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, volume] = e;
    return {
      time,
      volume
    };
  });
  return (new Date(historicalVolume[0].time).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
      start: getStartTimestamp,
      // customBackfill: customBackfill(CHAIN.FLOW as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
