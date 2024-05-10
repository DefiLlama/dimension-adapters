import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports, getDexVolumeExportsV3 } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367';
const FACTORY_V3_ADDRESS = '0x952aC46B2586737df679e836d9B980E43E12B2d8';

const adapter: BreakdownAdapter = {
  breakdown:{
    v2: {
      [CHAIN.SCROLL]: {
        fetch: getDexVolumeExports({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS }),
        start:  1710806400,
      },
    },
    sprinkler: {
      [CHAIN.SCROLL]: {
        fetch: getDexVolumeExportsV3({
            factory: FACTORY_V3_ADDRESS,
            factoryFromBlock: 4627488,
            chain: CHAIN.SCROLL
        }) as Fetch,
        start: 1712174400,
        },
    },
  }
};

export default adapter;
