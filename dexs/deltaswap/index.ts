import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.MANTLE, factory: '0xcb85e1222f715a81b8edaeb73b28182fa37cffa8' }),
      start: 1706745600,
    },
    [CHAIN.BASE]: {
      fetch: getDexVolumeExports({ chain: CHAIN.MANTLE, factory: '0x9a9a171c69cc811dc6b59bb2f9990e34a22fc971' }),
      start: 14455515,
    },
    [CHAIN.ETHEREUM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.MANTLE, factory: '0x5fbe219e88f6c6f214ce6f5b1fcaa0294f31ae1b' }),
      start: 19964909,
    }
  }
}
export default adapters;
