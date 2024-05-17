import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xAAA16c016BF556fcD620328f0759252E29b1AB57'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: getDexVolumeExports({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS }),
      start: 1714608000,
    },
  }
};

export default adapter;