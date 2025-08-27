import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xEB4Af6fA3AFA08B10d593EC8fF87efB03BC04645',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)