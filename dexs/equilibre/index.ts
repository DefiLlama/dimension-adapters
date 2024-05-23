import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KAVA]: {
      fetch: getDexVolumeExports({ chain: CHAIN.KAVA, factory: FACTORY_ADDRESS }),
      start: 1677888000,
    },
  }
};

export default adapter;
