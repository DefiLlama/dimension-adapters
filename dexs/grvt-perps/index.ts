import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

// endTime is in seconds
const endpoint = (startTime: number, endTime: number) => {
  return `https://openview.grvt.io/api/v1/defillama/stats?start_timestamp=${startTime}&end_timestamp=${endTime}`;
};

export async function fetchGRVTDex(options: FetchOptions) {
  const url = endpoint(options.startTimestamp, options.endTimestamp);
  const resp = await fetchURL(url);

  return {
    dailyVolume: resp.dailyVolume,
    openInterestAtEnd: resp.dailyOpenInterest
  };
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.GRVT]: {
      fetch: fetchGRVTDex,
      start: '2024-12-01',
    },
  },
};

export default adapter;
