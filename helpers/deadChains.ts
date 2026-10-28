import * as sdk from "@defillama/sdk"

export const deadChains = [
  ...sdk.chainUtils.getDeadChains()
]


export const deadChainsSet = new Set(deadChains)
