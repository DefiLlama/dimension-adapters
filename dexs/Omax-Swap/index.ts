import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x441b9333D1D1ccAd27f2755e69d24E60c9d8F9CF'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.omax]: {
      fetch: getDexVolumeExports({ chain: CHAIN.omax, factory: FACTORY_ADDRESS }),
      start: 1683244800,
    },
  }
};

export default adapter;
