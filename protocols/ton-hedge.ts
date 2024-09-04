// import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TON]: {
      fetch: async (timestamp) => {
        const result = await fetchURL(
          `https://tonhedge.com/api/metrics?timestamp=${timestamp * 1000}`
        )
        return {
          ...result,
          timestamp
        }
      },
      start: 1719847914,
      meta: {
        methodology: {
          Volume: "Total costs + payouts",
        }
      }
    },
  },
};

export default adapter;
