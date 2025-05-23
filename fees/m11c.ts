import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by M11C.',
    Revenue: 'Amount of fees were collected by M11C from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x2C3Cc1C02856894345797Cf6ee76aE76AC0f4031',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
