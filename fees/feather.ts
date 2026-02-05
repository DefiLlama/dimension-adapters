import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.SEI]: {
      morpho: [
        '0x948FcC6b7f68f4830Cd69dB1481a9e1A142A4923',
        '0x015F10a56e97e02437D294815D8e079e1903E41C',
      ],
      start: '2025-10-02',
    },
  }
}
export default getCuratorExport(curatorConfig)
