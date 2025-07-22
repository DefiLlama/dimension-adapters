import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    hyperliquid: {
      morpho: [
        '0x835febf893c6dddee5cf762b0f8e31c5b06938ab',
        '0xfc5126377f0efc0041c0969ef9ba903ce67d151e',
      ]
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
