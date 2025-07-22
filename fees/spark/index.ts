import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.ETHEREUM]: {
        start: '2023-03-08',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xc13e21b648a5ee794902342038ff3adab66be987',
            dataProvider: '0xfc21d6d146e6086b8359705c8b28512a983db0cb',
          },
        ],
      },
      [CHAIN.XDAI]: {
        start: '2023-09-06',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2dae5307c5e3fd1cf5a72cb6f698f915860607e0',
            dataProvider: '0x2a002054a06546bb5a264d57a81347e23af91d18',
          },
        ],
      },
    })
  }
}

export default adapter
