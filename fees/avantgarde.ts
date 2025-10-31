import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0xb263237E30fe9be53d6F401FCC50dF125D60F01a',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
