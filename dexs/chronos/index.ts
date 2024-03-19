import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.ARBITRUM, factory: FACTORY_ADDRESS }),
      start: 1679702400,
    },
  }
};

export default adapter;
