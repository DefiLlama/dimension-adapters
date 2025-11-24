import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      eulerVaultOwners: [
        '0x5aB5FE7d04CFDeFb9daf61f6f569a58A53D05eE1',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
