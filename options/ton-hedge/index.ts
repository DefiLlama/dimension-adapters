// import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TON]: {
      fetch: (timestamp) => fetchURL(
        `https://tonhedge.com/api/metrics?timestamp=${timestamp * 1000}`
      ),
      start: 1719847914,
    },
  },
};

export default adapter;
