import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { exportDexVolumeAndFees } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xAAA16c016BF556fcD620328f0759252E29b1AB57';

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: (options: FetchOptions) =>  exportDexVolumeAndFees({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS,})(options.endTimestamp, null, options),
      start: 1714608000,
    },
  }
};

export default adapter;
