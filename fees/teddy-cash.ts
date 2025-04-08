import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.AVAX]: { 
    troveManager: '0xd22b04395705144Fd12AfFD854248427A2776194',
    stableCoin: '0x4fbf0429599460D327BD5F55625E30E4fC066095',
  }
})