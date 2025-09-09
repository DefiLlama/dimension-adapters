import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x76c303fA012109eCBb34E4bAf1789c3e9FbEb3A4',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
