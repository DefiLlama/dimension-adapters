import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x633a093C9e94f64500FC8fCBB48e90dd52F6668F'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.METIS]: {
      fetch: getDexVolumeExports({ chain: CHAIN.METIS, factory: FACTORY_ADDRESS }),
      start: 1670544000,
    },
  }
};

export default adapter;
