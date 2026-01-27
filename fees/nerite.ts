import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default liquityV2Exports({
  [CHAIN.ARBITRUM]: { collateralRegistry: '0x7f7fbc2711c0d6e8ef757dbb82038032dd168e68', stabilityPoolRatio: 1, start: '2025-07-11', }
})