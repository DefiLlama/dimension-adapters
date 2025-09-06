import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

const historicalVolumeEndpoint = "https://public-osmosis-api.numia.xyz/volume/historical/chart"

interface IChartItem {
  time: string
  value: number
}

const fetch = async (timestamp: number, _at: any, { startOfDay, dateString }: FetchOptions) => {

  const hours36 = 36 * 60 * 60
  const now = Math.floor(Date.now() / 1000)
  if (now - startOfDay < hours36) throw new Error(`Data for ${dateString} is not available yet.`)
  const historicalVolume: IChartItem[] = (await fetchURL(historicalVolumeEndpoint));

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time.split('T')[0] === dateString)?.value

    return {
      dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OSMOSIS]: {
      fetch,
      start: "2022-04-15",
    },
  },
};

export default adapter;
