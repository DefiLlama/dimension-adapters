import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Ouroboros Capital.',
    Revenue: 'Amount of fees were collected by Ouroboros Capital from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x2F21c6499fa53a680120e654a27640Fc8Aa40BeD',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
