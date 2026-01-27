// import { Chain } from "../../adapters/types";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";


const adapter: SimpleAdapter = {
        methodology: {
          Volume: "Total costs + payouts",
        },
  adapter: {
    [CHAIN.TON]: {
      fetch: async (timestamp: number, _t: any, options: FetchOptions) => {
        const result = await fetchURL(
          `https://tonhedge.com/api/metrics?timestamp=${options.startOfDay * 1000}`
        )
        return {
          ...result,
          timestamp
        }
      },
      start: '2024-07-01',
    },
  },
};

export default adapter;
