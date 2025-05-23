import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.PULSECHAIN]: { 
    troveManager: '0xC2D0720721d48cE85e20Dc9E01B8449D7eDd14CE',
    stableCoin: '0x1fe0319440a672526916c232eaee4808254bdb00',
  }
})