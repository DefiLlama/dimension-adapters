import { CHAIN } from "../helpers/chains"
import { liquityV2Exports } from "../helpers/liquity"

export default liquityV2Exports({
  [CHAIN.HYPERLIQUID]: { collateralRegistry: '0x9De1e57049c475736289Cb006212F3E1DCe4711B', stableTokenAbi: "address:feUSDToken", stabilityPoolRatio: 1, start: '2025-03-14' }
})
