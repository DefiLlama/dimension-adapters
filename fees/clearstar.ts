import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    base: {
      morphoVaultOwners: [
        '0x30988479C2E6a03E7fB65138b94762D41a733458',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)