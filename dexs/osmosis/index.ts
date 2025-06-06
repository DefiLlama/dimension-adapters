import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL"

const historicalVolumeEndpoint = "https://public-osmosis-api.numia.xyz/volume/historical/chart"

interface IChartItem {
  time: string
  value: number
}

const fetch = async (timestamp: number, _at: any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)
  const historicalVolume: IChartItem[] = (await fetchURL(historicalVolumeEndpoint));

  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];

  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.time).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + value, 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time.split('T')[0] === dateStr)?.value

    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IChartItem[] = (await fetchURL(historicalVolumeEndpoint))
  return (new Date(historicalVolume[0].time).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OSMOSIS]: {
      fetch,
      // runAtCurrTime: true,
      start: "2022-04-15",
    },
  },
};

export default adapter;
