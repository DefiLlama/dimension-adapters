import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x16fa314141C76D4a0675f5e8e3CCBE4E0fA22C7c',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
