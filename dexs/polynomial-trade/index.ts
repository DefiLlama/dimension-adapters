import { SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";

const volumeEndpoint = "https://perps-api-experimental.polynomial.fi/snx-perps/volume"
const oneDay = 86400
const startTimeStamp = 1679875200

const fetch = async (timestamp: number) => {
    const startDayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    return {
      dailyVolume: await getDailyVolume(startDayTimestamp),
      totalVolume: await getTotalVolume(timestamp),
      timestamp: startDayTimestamp,
    };
  };

  const getStartTimestamp = async () => {
    return startTimeStamp;
  }

  async function getDailyVolume(startDayTimestamp: number) : Promise<string> {
    const endDayTimeStamp = startDayTimestamp + oneDay
    const dailyVolumeQuery = '?from='+startDayTimestamp.toString()+'&to='+endDayTimeStamp.toString()
    return (await fetchURL(volumeEndpoint+dailyVolumeQuery));
  }

  async function getTotalVolume(endtimestamp: number) : Promise<string> {
    let timestamp = startTimeStamp
    let historicalVolume = 0
    let startDayArray : number[] = [];
    while (timestamp < endtimestamp)
    {
      startDayArray.push(timestamp)
      timestamp += oneDay
    }
    const volumes = await Promise.all(
      startDayArray.map( async startDay =>
        parseFloat(await getDailyVolume(startDay))
    ))
    volumes.forEach(volume => {historicalVolume += volume})
    return historicalVolume.toString();
  }

  const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.OPTIMISM]: {
        fetch,
        start: getStartTimestamp,
      },
    },
  };

  export default adapter;
