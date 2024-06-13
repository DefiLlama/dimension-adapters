//  Maverick v2 volume
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getData, maverickV2Factories } from "./maverick-v2";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getData,
      start: maverickV2Factories[CHAIN.BSC].startTimestamp,
    },
    [CHAIN.BASE]: {
      fetch: getData,
      start: maverickV2Factories[CHAIN.BASE].startTimestamp,
    },
    [CHAIN.ERA]: {
      fetch: getData,
      start: maverickV2Factories[CHAIN.ERA].startTimestamp,
    },
    [CHAIN.ETHEREUM]: {
      fetch: getData,
      start: maverickV2Factories[CHAIN.ETHEREUM].startTimestamp,
    },
    [CHAIN.ARBITRUM]: {
      fetch: getData,
      start: maverickV2Factories[CHAIN.ARBITRUM].startTimestamp,
    },
  },
};

export default adapter;
