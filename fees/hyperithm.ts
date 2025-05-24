import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Hyperithm.',
    Revenue: 'Amount of fees were collected by Hyperithm from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x777791C4d6DC2CE140D00D2828a7C93503c67777'
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
