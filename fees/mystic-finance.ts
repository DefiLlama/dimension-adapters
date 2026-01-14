import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.PLUME]: {
      morpho: [
        '0xc0Df5784f28046D11813356919B869dDA5815B16',
        '0x0b14D0bdAf647c541d3887c5b1A4bd64068fCDA7',
        '0xBB748a1346820560875CB7a9cD6B46c203230E07',
      ],
      start: '2025-05-14',
    },
  },
}

export default getCuratorExport(curatorConfig)
