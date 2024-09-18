import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';


export default uniV2Exports({
  [CHAIN.FANTOM]: { factory: FACTORY_ADDRESS, },
  [CHAIN.KCC]: { factory: FACTORY_ADDRESS, },
  [CHAIN.KAVA]: { factory: FACTORY_ADDRESS, },
})
