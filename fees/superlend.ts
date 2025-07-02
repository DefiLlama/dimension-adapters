import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.ETHERLINK]: {
        start: '2024-10-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3bD16D195786fb2F509f2E2D7F69920262EF114D',
            dataProvider: '0x99e8269dDD5c7Af0F1B3973A591b47E8E001BCac',
          },
        ],
      },
    })
  }
}

export default adapter
