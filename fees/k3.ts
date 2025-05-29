import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    bsc: {
      eulerVaultOwners: [
        '0x5Bb012482Fa43c44a29168C6393657130FDF0506',
        '0x2E28c94eE56Ac6d82600070300d86b3a14D5d71A',
      ],
    },
    avax: {
      eulerVaultOwners: [
        '0xa4dC6C20475fDD05b248fbE51F572bD3154dd03B',
      ],
    },
    bob: {
      eulerVaultOwners: [
        '0xDb81B93068B886172988A1A4Dd5A1523958a23f0',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
