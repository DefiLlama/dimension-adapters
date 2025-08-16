import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49',
      ],
      eulerVaultOwners: [
        '0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
