import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b', revenueRatio: 0.64 }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
