import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0x16fa314141C76D4a0675f5e8e3CCBE4E0fA22C7c',
      ],
      morphoVaultV2Owners: [
        '0xC56EA16EA06B0a6A7b3B03B2f48751e549bE40fD',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
