import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x71807287926c5195D92D2872e73FC212C150C112',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
