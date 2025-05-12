import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.HYPERLIQUID]: {
        start: '2025-03-22',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b',
            dataProvider: '0x5481bf8d3946E6A3168640c1D7523eB59F055a29',
          },
        ],
      },
    })
  }
}

export default adapter
