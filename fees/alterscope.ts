import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      eulerVaultOwners: [
        '0x0d8249DD621fB1c386A7A7A949504035Dd3436A3',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
