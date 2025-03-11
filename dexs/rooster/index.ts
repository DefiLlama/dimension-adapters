//  Maverick v2 volume
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { createGetData } from "../maverick-v2/maverick-v2";

export const factories: { [key: string]: any } = {
  [CHAIN.PLUME]: {
    factory: "0x056A588AfdC0cdaa4Cab50d8a4D2940C5D04172E",
    startBlock: 91952,
    startTimestamp: 1734665440,
  },
};

const getData = createGetData(factories);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PLUME]: {
      fetch: getData,
      start: factories[CHAIN.PLUME].startTimestamp,
    },
  },
};

export default adapter;
