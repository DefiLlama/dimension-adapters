import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL"
import { getEnv } from "../../helpers/env";

const historicalVolumeEndpoint = "https://neutron.numia.xyz/trading/volume"

interface IChartItem {
  day: string
  value: number
}

const fetchVolumeWithAuth = async () => {
  const headers = { "Authorization": `Bearer ${getEnv('NUMIA_API_KEY')}`, "Content-Type": "application/json" };
  const historicalVolume: IChartItem[] = await httpGet(historicalVolumeEndpoint, { headers: headers });
  return historicalVolume
}

const fetch = async (_timestamp: number, _at: any, options: FetchOptions) => {

  const historicalVolume = await fetchVolumeWithAuth()
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)

  const dailyVolume = historicalVolume.find(dayItem => (new Date(dayItem.day).getTime() / 1000) == dayTimestamp)?.value


  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEUTRON]: {
      fetch,
      start: '2024-07-22',
    },
  },
};

export default adapter;
