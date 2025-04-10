import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.PULSECHAIN]: { 
    troveManager: '0x118b7CF595F6476a18538EAF4Fbecbf594338B39',
    stableCoin: '0xeb6b7932da20c6d7b3a899d5887d86dfb09a6408',
  }
})