import { Fetch, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getDexVolumeExportsV3 } from "../../helpers/dexVolumeLogs";

const poolFactoryAddress = '0x4Db9D624F67E00dbF8ef7AE0e0e8eE54aF1dee49';

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getDexVolumeExportsV3({ factory: poolFactoryAddress, factoryFromBlock: 114041129, chain: CHAIN.ARBITRUM,  }) as Fetch,
      start: 1690070400,
    }
  }
}

export default adapters;
