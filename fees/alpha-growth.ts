import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.UNICHAIN]: {
      eulerVaultOwners: [
        '0x8d9fF30f8ecBA197fE9492A0fD92310D75d352B9',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
