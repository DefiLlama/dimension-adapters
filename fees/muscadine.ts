import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    base: {
      morphoVaultOwners: [
        '0x4E5D3ef790C75682ac4f6d4C1dDCc08b36fC100A',
        '0xf35B121bA32cBeaA27716abEfFb6B65a55f9B333',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
