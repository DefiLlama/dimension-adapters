import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8',
        '0x255c7705e8BB334DfCae438197f7C4297988085a',
        '0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD',
        '0xc01Ba42d4Bd241892B813FA8bD4589EAA4C60672',
      ],
      morphoVaultV2Owners: [
        '0xec0Caa2CbAe100CEAaC91A665157377603a6B766',
      ],
    },
    [CHAIN.BASE]: {
      morphoVaultOwners: [
        '0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD',
        '0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8',
      ],
      morphoVaultV2Owners: [
        '0x351D76EC45f0aD6Deb498806F1320F75F861a114',
      ],
    },
    [CHAIN.CORN]: {
      morphoVaultOwners: [
        '0x84ae7f8eb667b391a5ae2f69bd5a0e4b5b77c999',
      ],
      start: '2025-04-30',
    },
    [CHAIN.MONAD]: {
      morphoVaultOwners: [
        '0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8',
      ],
      morphoVaultV2Owners: [
        '0xD546Dc0dB55c28860176147b2D0FEFcc533eCf08',
      ],
      start: '2025-12-15',
    },
    // [CHAIN.KATANA]: {
    //   morphoVaultOwners: [
    //     '0xe6FC2a011153DD5a230725a9F0c89a9c81aB4887',
    //   ],
    // },
    // [CHAIN.STABLE]: {
    //   morphoVaultV2Owners: [
    //     '0x1716D63E23BB205544540dc875Ca8bD4FFaF5bB2',
    //   ],
    // },
  }
}

export default getCuratorExport(curatorConfig)
