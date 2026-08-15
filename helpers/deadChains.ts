import * as sdk from "@defillama/sdk"

export const deadChains = [
  ...sdk.chainUtils.getDeadChains(),
  'moonbeam', // parachain wind-down announced 2026-07-03, GLMR migrated to Base, last block 16796699 on 2026-08-10: https://forum.moonbeam.network/t/multisig-maintenance-wind-down-moonbeam-moonriver-and-moonbase-july-2026/2512
  'moonriver', // same wind-down as moonbeam, MOVR migrated to Base, last block 17381654 on 2026-08-10
]


export const deadChainsSet = new Set(deadChains)
