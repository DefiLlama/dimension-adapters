import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.SONIC]: {
        start: '2025-02-07',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xaa1C02a83362BcE106dFf6eB65282fE8B97A1665',
            dataProvider: '0xc67850eCd0EC9dB4c0fD65C1Ad43a53025e6d54D',
          },
          {
            version: 3,
            lendingPoolProxy: '0x220fc1bEcC9bbE1a9dD81795F0505cC36E1B2563',
            dataProvider: '0xe78536507675de30D375C6d2B5dA1a99819Ea9fa',
          },
          {
            version: 3,
            lendingPoolProxy: '0x3C7FEA4d4c3EbBf19E73b6C99CE4B8884B87Bfa6',
            dataProvider: '0x94e8122dF227B34998Ba7523ad88c943191cF4F1',
          },
        ],
      },
    })
  }
}

export default adapter
