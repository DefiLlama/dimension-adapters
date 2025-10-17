import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.BASE]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.POLYGON]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.UNICHAIN]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.KATANA]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.ARBITRUM]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
    [CHAIN.HEMI]: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458'
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)