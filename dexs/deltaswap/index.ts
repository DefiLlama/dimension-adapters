import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xcb85e1222f715a81b8edaeb73b28182fa37cffa8'
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.MANTLE, factory: FACTORY_ADDRESS }),
      start: 1706745600,
    }
  }
}
export default adapters;
