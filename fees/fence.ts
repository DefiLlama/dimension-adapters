import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Fence.',
    Revenue: 'Amount of fees were collected by Fence from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0xC21DB71648B18C5B9E038d88393C9b254cf8eaC8',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
