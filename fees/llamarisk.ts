import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Llama Risk.',
    Revenue: 'Amount of fees were collected by Llama Risk from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x67315dd969B8Cd3a3520C245837Bf71f54579C75',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
