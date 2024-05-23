import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xb54a83cfEc6052E05BB2925097FAff0EC22893F3'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CORE]: {
      fetch: getDexVolumeExports({ chain: CHAIN.CORE, factory: FACTORY_ADDRESS }),
      start: 1715904000,
    },
  }
};

export default adapter;
