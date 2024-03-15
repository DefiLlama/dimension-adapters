import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getDexVolumeExports({ chain: CHAIN.BASE, factory: FACTORY_ADDRESS }),
      start: 1695458888,
    },
  }
};

export default adapter;
