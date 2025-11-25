import { CuratorConfig, getCuratorExport } from "../../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morpho: [
        '0x9F230218cf7FDe6A9246e6f8CB0b888377E92639',
      ],
    },
    arbitrum: {
      morpho: [
        '0x9F230218cf7FDe6A9246e6f8CB0b888377E92639',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)

