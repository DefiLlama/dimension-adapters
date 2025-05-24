import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Alphaping.',
    Revenue: 'Amount of fees were collected by Alphaping from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0xb0f05E4De970A1aaf77f8C2F823953a367504BA9',
        '0x6619F92861C760AD11BA0D56E8ED63A33EccE22B',
        '0xFa7ED49Eb24A6117D8a3168EEE69D26b45C40C63',
        '0x47fe8Ab9eE47DD65c24df52324181790b9F47EfC'
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
