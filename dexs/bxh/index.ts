import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x7897c32cbda1935e97c0b59f244747562d4d97c1' }) },
    [CHAIN.ETHEREUM]: { fetch: getUniV2LogAdapter({ factory: '0x8d0fCA60fDf50CFE65e3E667A37Ff3010D6d1e8d' }) },
    [CHAIN.AVAX]: { fetch: getUniV2LogAdapter({ factory: '0xDeC9231b2492ccE6BA01376E2cbd2bd821150e8C' }) },
    // [CHAIN.HECO]: { fetch: getUniV2LogAdapter({ factory: '0xe0367ec2bd4ba22b1593e4fefcb91d29de6c512a' }) },
    // [CHAIN.OKEXCHAIN]: { fetch: getUniV2LogAdapter({ factory: '0xff65bc42c10dcc73ac0924b674fd3e30427c7823' }) },
  },
}

export default adapter;
