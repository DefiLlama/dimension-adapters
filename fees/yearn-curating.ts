import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B',
      ],
    },
    base: {
      morphoVaultOwners: [
        '0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B',
        '0x50b75d586929ab2f75dc15f07e1b921b7c4ba8fa',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
