import {FetchOptions, FetchResult, SimpleAdapter} from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC, getTimestampAtStartOfDayUTC } from "../../utils/date";

// endTime is in seconds
const endpoint = (startTime: number, endTime: number) => {
  return `https://openview.grvt.io/api/v1/defillama/stats?start_timestamp=${startTime}&end_timestamp=${endTime}`;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZKSYNC]: {
      fetch: fetchGRVTFees,
      start: '2024-12-01',
    },
  },
};

export async function fetchGRVTFees(fetchOptions: FetchOptions) {
  const startOfDayUTC = getTimestampAtStartOfDayUTC(fetchOptions.startTimestamp);
  const endOfDayUTC = getTimestampAtStartOfDayUTC(fetchOptions.endTimestamp);
  const url = endpoint(startOfDayUTC,endOfDayUTC);
  const resp = await getData(url);
  const dailyFees = Number(resp.dailyFees).toFixed(5);
  const dailyRevenue = Number(resp.dailyRevenue).toFixed(5);

  return {
    timestamp: startOfDayUTC,
    dailyFees,
    dailyRevenue
  };
}

async function getData(
  endpoint: string
): Promise<FetchResult> {
  return await fetchURL(endpoint);
}

export default adapter;
