import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default liquityV2Exports({
  [CHAIN.ETHEREUM]: { collateralRegistry: '0x1ec9287465ef04a7486779e81370c15624c939e8', stabilityPoolRatio: 1, start: '2025-07-04' },
})