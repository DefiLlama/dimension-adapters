import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    optimism: {
      morphoVaultOwners: [
        '0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54',
      ],
      start: '2025-02-01',
    },
  }
}

export default getCuratorExport(curatorConfig)
