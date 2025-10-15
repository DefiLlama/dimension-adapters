import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: aaveExport({
      [CHAIN.SOMNIA]: {
        start: '2025-09-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xEC6758e6324c167DB39B6908036240460a2b0168',
            dataProvider: '0x6A8c1d9ff923B75D662Ee839E4AD8949279bAF10',
          },
        ],
      },
    })
  
}

export default adapter
