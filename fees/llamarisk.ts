import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x0FB44352bcfe4c5A53a64Dd0faD9a41184A1D609',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
