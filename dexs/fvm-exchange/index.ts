import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getDexVolumeExports({ chain: CHAIN.FANTOM, factory: FACTORY_ADDRESS }),
      start: 1688172646, // when PairFactory was created https://ftmscan.com/address/0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A
    },
  },
}

export default adapter