import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDexFeesExports } from "../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getDexFeesExports({ chain: CHAIN.ARBITRUM, factory: FACTORY_ADDRESS,}),
      start: 1678838400,
    },
  }
};

export default adapter;