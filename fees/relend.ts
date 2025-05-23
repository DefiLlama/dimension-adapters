import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Relend Network.',
    Revenue: 'Amount of fees were collected by Relend Network from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x0F359FD18BDa75e9c49bC027E7da59a4b01BF32a',
        '0xB9C9158aB81f90996cAD891fFbAdfBaad733c8C6',
      ],
    },
    base: {
      morpho: [
        '0x70F796946eD919E4Bc6cD506F8dACC45E4539771',
      ],
    },
    swellchain: {
      euler: [
        '0xc5976e0356f0A3Ce8307fF08C88bB05933F88761',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
