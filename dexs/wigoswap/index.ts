import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.FANTOM, factory: '0xc831a5cbfb4ac2da5ed5b194385dfd9bf5bfcba7' }),
      start: 1642982400,
    },
  }
}
export default adapters;