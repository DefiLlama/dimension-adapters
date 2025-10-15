import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.BSC]: {
      eulerVaultOwners: [
        '0x5Bb012482Fa43c44a29168C6393657130FDF0506',
        '0x2E28c94eE56Ac6d82600070300d86b3a14D5d71A',
      ],
    },
    [CHAIN.AVAX]: {
      eulerVaultOwners: [
        '0xa4dC6C20475fDD05b248fbE51F572bD3154dd03B',
      ],
    },
    [CHAIN.BOB]: {
      eulerVaultOwners: [
        '0xDb81B93068B886172988A1A4Dd5A1523958a23f0',
      ],
    },
    [CHAIN.PLASMA]: {
      eulerVaultOwners: [
        '0x060DB084bF41872861f175d83f3cb1B5566dfEA3',
      ],
    },
    [CHAIN.ARBITRUM]: {
      eulerVaultOwners: [
        '0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C',
      ],
    },
  }
}
export default getCuratorExport(curatorConfig)

