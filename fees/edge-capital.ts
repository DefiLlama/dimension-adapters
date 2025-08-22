import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    tac: {
      eulerVaultOwners: [
        '0xB2b9a27a6160Bf9ffbD1a8d245f5de75541b1DDD',
        '0x1280e86Cd7787FfA55d37759C0342F8CD3c7594a',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
