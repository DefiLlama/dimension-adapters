import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.DCHAIN]: {
      fetch: getUniV3LogAdapter({
        factory: "0x0A513fac50880fb7fC1588D0A590583Ef34D85a1",
      }),
      start: '2024-01-01',
    },
  },
};

export default adapter; 