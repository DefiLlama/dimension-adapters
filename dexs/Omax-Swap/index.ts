import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x441b9333D1D1ccAd27f2755e69d24E60c9d8F9CF';

// Unix timestamp for February 1, 2024, at 00:00:00 UTC
const FEBRUARY_1_2024_TIMESTAMP = 1683244800;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OMAX]: {
      fetch: getDexVolumeExports({ chain: CHAIN.OMAX, factory: FACTORY_ADDRESS }),
      start: FEBRUARY_1_2024_TIMESTAMP,
    },
  }
};

export default adapter;
