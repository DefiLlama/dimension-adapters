import { SimpleAdapter, Fetch, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExportsV3 } from "../../helpers/dexVolumeLogs";

const FACTORY_V3_ADDRESS = '0x952aC46B2586737df679e836d9B980E43E12B2d8';

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SCROLL]: {
            fetch: async (options: FetchOptions) => getDexVolumeExportsV3({factory: FACTORY_V3_ADDRESS,factoryFromBlock: 4627488, chain: CHAIN.SCROLL})(options.toTimestamp, null, options),
            start: 1712174400,
        }
    }
};

export default adapter;
