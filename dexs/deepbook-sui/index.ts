import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://49490zsfv2.execute-api.us-east-1.amazonaws.com/sui/deepbook?interval=day&timeFrame=all&dataType=volume"

interface IVolumeall {
  volume: string;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.data;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.timestamp).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem =>  dayItem.timestamp.split("T")[0] === dateString)?.volume

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
      start: async () => 1687824000,
    },
  },
};

export default adapter;
