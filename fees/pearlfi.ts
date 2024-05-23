import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDexFeesExports } from "../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: getDexFeesExports({ chain: CHAIN.POLYGON, factory: FACTORY_ADDRESS,}),
      start: 1686268800,
    },
  }
};

export default adapter;
