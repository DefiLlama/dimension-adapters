import postURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://api.ston.fi/v1/stats/dex?"


const fetch = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0]
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0]
  const res = await postURL(`${endpoint}since=${startTime}&until=${endTime}`)

  return {
    dailyVolume: parseInt(res['stats']['volume_usd']),
    timestamp: options.startTimestamp,
  };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2022-11-18',
    },
  },
};

export default adapter;
