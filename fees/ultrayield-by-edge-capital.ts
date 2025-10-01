import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    tac: {
      eulerVaultOwners: [
        '0x1280e86Cd7787FfA55d37759C0342F8CD3c7594a',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
