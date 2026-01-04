import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      eulerVaultOwners: [
        '0x5aB5FE7d04CFDeFb9daf61f6f569a58A53D05eE1',
      ],
      morphoVaultV2Owners: [
        '0x13DE0cEE0B83562CBfD46682e10FfA4E3c5090e1',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
