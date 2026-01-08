import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    // tracked on mystic-finance
    // [CHAIN.PLUME]: {
    //   morpho: [
    //     '0xc0Df5784f28046D11813356919B869dDA5815B16',
    //     '0x0b14D0bdAf647c541d3887c5b1A4bd64068fCDA7',
    //     '0xBB748a1346820560875CB7a9cD6B46c203230E07',
    //   ],
    // },
    [CHAIN.HEMI]: {
      morphoVaultOwners: [
        '0x05c2e246156d37b39a825a25dd08D5589e3fd883',
        '0xA7dB73F80a173c31A1241Bf97F4452A07e443c6c',
        '0x7e8195b96bbcFAd0e20243Dcc686D188a827F256',
      ],
      start: '2025-09-13',
    },
  }
}

export default getCuratorExport(curatorConfig)
