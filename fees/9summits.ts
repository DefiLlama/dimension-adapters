import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF',
      ],
      morpho: [
        '0xb5e4576C2FAA16b0cC59D1A2f3366164844Ef9E0', // co-curator with tulip-capital
        '0x1E2aAaDcF528b9cC08F43d4fd7db488cE89F5741', // co-curator with tulip-capital
        '0x0bB2751a90fFF62e844b1521637DeD28F3f5046A', // co-curator with tulip-capital
      ],
    },
    base: {
      morphoVaultOwners: [
        '0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
