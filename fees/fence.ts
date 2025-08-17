import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xF92971B4D9e6257CF562400ed81d2986F28a8c26',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
