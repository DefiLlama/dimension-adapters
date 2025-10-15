import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      eulerVaultOwners: [
        '0xEe009FAF00CF54C1B4387829aF7A8Dc5f0c8C8C5',
        '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4',
      ],
    },
    [CHAIN.BASE]: {
      eulerVaultOwners: [
        '0x8359062798F09E277ABc6EB7D51652289176D2e9',
        '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4',
      ],
    },
    [CHAIN.UNICHAIN]: {
      eulerVaultOwners: [
        '0x3566a8b300606516De2E4576eC4132a0E13f9f66',
      ],
    },
    [CHAIN.SWELLCHAIN]: {
      eulerVaultOwners: [
        '0xC798cA555e4C7e6Fa04A23e1a727c12884F40B69',
      ],
    },
    [CHAIN.LINEA]: {
      eulerVaultOwners: [
        '0x624DC899774EEf1cD9c17ED10d19c9483Fa9eb0A',
      ],
    },
    [CHAIN.ARBITRUM]: {
      eulerVaultOwners: [
        '0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
