import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      eulerVaultOwners: [
        '0x7054b25D47b9342dA3517AD41A4BD083De8D3f70',
        '0x7d07BFdd01422D7b655B333157eB551B9712dCd8',
      ],
      start: '2025-10-04',
    },
    [CHAIN.PLASMA]: {
      eulerVaultOwners: [
        '0x7054b25D47b9342dA3517AD41A4BD083De8D3f70',
        '0x7d07BFdd01422D7b655B333157eB551B9712dCd8',
      ],
      start: '2025-09-27',
    },
  }
}
export default getCuratorExport(curatorConfig)

