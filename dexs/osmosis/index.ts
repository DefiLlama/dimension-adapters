import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"

const historicalVolumeEndpoint = "https://public-osmosis-api.numia.xyz/volume/historical/chart"

interface IChartItem {
  time: string
  value: number
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IChartItem[] = (await fetchURL(historicalVolumeEndpoint));

  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];

  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.time).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + value, 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time === dateStr)?.value

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IChartItem[] = (await fetchURL(historicalVolumeEndpoint))
  return (new Date(historicalVolume[0].time).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OSMOSIS]: {
      fetch,
      // runAtCurrTime: true,
      start: getStartTimestamp,
    },
  },
};

export default adapter;
