import { postURL } from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://www.tradoor.io/stats/volume"


const fetch = async (options: FetchOptions) => {
  const res = await postURL(endpoint, {
      "startTime": options.startTimestamp,
      "endTime": options.endTimestamp
  })

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
      start: 1716048000,
    },
  },
};

export default adapter;
