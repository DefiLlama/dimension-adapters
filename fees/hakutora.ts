import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Hakutora.',
    Revenue: 'Amount of fees were collected by Hakutora from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x974c8FBf4fd795F66B85B73ebC988A51F1A040a9',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
