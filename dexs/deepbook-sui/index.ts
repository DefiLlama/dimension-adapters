import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://kx58j6x5me.execute-api.us-east-1.amazonaws.com/sui/deepbook?interval=day&timeFrame=1000&dataType=volume"

interface IVolumeall {
  volume?: string; // some items are missing volume
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
    .filter((e: IVolumeall) => !isNaN(Number(e.volume))) // Fix: Convert volume to number
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .filter(dayItem =>  dayItem.date.split(" ")[0] === dateString)
    .filter((e: IVolumeall) => !isNaN(Number(e.volume))) // Fix: Convert volume to number
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: 1687824000,
    },
  },
};

export default adapter;
