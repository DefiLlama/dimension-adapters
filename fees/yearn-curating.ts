import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B',
      ],
    },
    [CHAIN.BASE]: {
      morphoVaultOwners: [
        '0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B',
        '0x50b75d586929ab2f75dc15f07e1b921b7c4ba8fa',
      ],
    },
    // [CHAIN.KATANA]: {
    //   morphoVaultOwners: [
    //     '0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B',
    //   ],
    //   morphoVaultV2Owners: [
    //     '0x75a1253432356f90611546a487b5350CEF08780D',
    //   ],
    // },
  }
}

export default getCuratorExport(curatorConfig)
