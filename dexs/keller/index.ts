import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports, getDexVolumeExportsV3 } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367';

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: getDexVolumeExports({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS }),
      start:  1710806400,
    }
  }
};

export default adapter;
