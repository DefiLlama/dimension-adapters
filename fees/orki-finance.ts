import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"


export default liquityV2Exports({
  [CHAIN.SWELLCHAIN]: { collateralRegistry: '0xce9f80a0dcd51fb3dd4f0d6bec3afdcaea10c912', stabilityPoolRatio: 1, start: '2025-05-13', },
})