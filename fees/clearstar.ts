import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Clearstar.',
    Revenue: 'Amount of fees were collected by Clearstar from all curated vaults.',
  },
  vaults: {
    base: {
      morpho: [
        '0x1D3b1Cd0a0f242d598834b3F2d126dC6bd774657',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
