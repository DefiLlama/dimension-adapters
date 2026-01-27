import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0x46057881E0B9d190920FB823F840B837f65745d5',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
