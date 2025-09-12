import { postURL } from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://www.tradoor.io/stats/volume"


const fetch = async (options: FetchOptions) => {
  const res = await postURL(endpoint, {
      "startTime": options.startTimestamp,
      "endTime": options.endTimestamp
  })

  console.log(options.fromTimestamp, options.toTimestamp)

  // bad data
  if (options.startTimestamp >= 1757635199 || options.toTimestamp <= 1757721599) {
    res['data'] = 0;
  }

  return {
    dailyVolume: parseInt(res['data']),
    timestamp: options.startTimestamp,
  };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-05-18',
    },
  },
};

export default adapter;
