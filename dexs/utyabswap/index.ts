import postURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://api.utyabswap.com/v1/stats/volume?"

const fetch = async (options: FetchOptions) => {
    const startTime = options.startTimestamp * 1000;
    const endTime = options.endTimestamp * 1000;
    const res = await postURL(`${endpoint}start_time=${startTime}&end_time=${endTime}`)

    return {
        dailyVolume: parseFloat(res['volume_usd']),
        timestamp: options.startTimestamp,
    };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-12-9',
    },
  },
  // api.utyabswap.com is NXDOMAIN and the utyabswap.com apex resolves with no A record. Last
  // published point 2025-08-26 ($1,994) and TVL is down to $6.
  deadFrom: '2025-08-27',
};

export default adapter;
