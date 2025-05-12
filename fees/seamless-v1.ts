import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.BASE]: {
        start: '2023-09-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7',
            dataProvider: '0x2A0979257105834789bC6b9E1B00446DFbA8dFBa',
          },
        ],
      },
    })
  }
}

export default adapter
