import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x5bef015ca9424a7c07b68490616a4c1f094bedec'
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: getDexVolumeExports({ chain: CHAIN.MANTLE, factory: FACTORY_ADDRESS }),
      start: 1706745600,
    }
  }
}
export default adapters;
