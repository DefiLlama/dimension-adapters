import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL, { httpGet } from "../../utils/fetchURL"
import { getEnv } from "../../helpers/env";

const historicalVolumeEndpoint = "https://neutron.numia.xyz/trading/volume"

interface IChartItem {
  day: string
  value: number
}

const fetchVolumeWithAuth = async ()=>{
  const headers =  {"Authorization": `Bearer ${getEnv('NUMIA_API_KEY')}`, "Content-Type": "application/json"};
  const historicalVolume: IChartItem[] = await httpGet(historicalVolumeEndpoint, { headers: headers });
  return historicalVolume
}

const fetch = async (_timestamp: number, _at: any, options: FetchOptions) => {

  const historicalVolume = await fetchVolumeWithAuth()
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)

  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.day).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + value, 0)

  const dailyVolume = historicalVolume
    .find(dayItem =>  (new Date(dayItem.day).getTime() / 1000) == dayTimestamp)?.value


  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume = await fetchVolumeWithAuth()
  return (new Date(historicalVolume[0].day).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEUTRON]: {
      fetch,
      start: getStartTimestamp,
    },
  },
};

export default adapter;
