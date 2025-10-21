import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    tac: {
      eulerVaultOwners: [
        '0x28D55817f358F7BE7505C918DaeCaA86366403f5',
        '0xb47a3b5ae494a20c69ff0486573ced665750dbc1',
        '0xB2b9a27a6160Bf9ffbD1a8d245f5de75541b1DDD',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
