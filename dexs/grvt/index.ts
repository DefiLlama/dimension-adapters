import {FetchResult, SimpleAdapter} from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC, getTimestampAtStartOfDayUTC } from "../../utils/date";

// endTime is in seconds
const endpoint = (startTime: number, endTime: number) => {
  return `https://grvt.io/statistics?start_timestamp=${startTime}&end_timestamp=${endTime}`;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZKSYNC]: {
      fetch: fetchGRVTDex,
      start: '2024-12-01',
    },
  },
};

export async function fetchGRVTDex(
  startTimestamp: number,
  endTimestamp: number,
) {
  const startOfDayUTC = getTimestampAtStartOfDayUTC(startTimestamp);
  const endOfDayUTC = getTimestampAtStartOfNextDayUTC(endTimestamp);
  const url = endpoint(startOfDayUTC,endOfDayUTC);
  const resp = await getGrvtVolumeData(url);
  const dailyVolume = Number(resp.dailyVolume).toFixed(5);

  return {
    timestamp: startOfDayUTC,
    dailyVolume,
  };
}

async function getGrvtVolumeData(
  endpoint: string
): Promise<FetchResult> {
  return await fetchURL(endpoint);
}

export default adapter;
