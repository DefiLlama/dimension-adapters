import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.AVAX]: {
      eulerVaultOwners: [
        '0x0B50beaE6aac0425e31d5a29080F2A7Dec22754a',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
