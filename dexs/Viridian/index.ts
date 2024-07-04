import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xb54a83cfEc6052E05BB2925097FAff0EC22893F3'

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: async (options: FetchOptions) => getDexVolumeExports({ chain: CHAIN.CORE, factory: FACTORY_ADDRESS, })(options.startOfDay, null, options),
      start: 1715904000,
    },
  }
};

export default adapter;
