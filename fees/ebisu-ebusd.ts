import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default liquityV2Exports({
  [CHAIN.ETHEREUM]: { collateralRegistry: '0x5e159fAC2D137F7B83A12B9F30ac6aB2ba6d45E7', },
  [CHAIN.PLASMA]: { collateralRegistry: '0x602096a2f43b43d11dcb3713702dda963c45adc6', },
})