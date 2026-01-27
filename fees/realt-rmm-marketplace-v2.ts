import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.XDAI]: {
        start: '2024-01-23',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xFb9b496519fCa8473fba1af0850B6B8F476BFdB3',
            dataProvider: '0x11B45acC19656c6C52f93d8034912083AC7Dd756',
          },
        ],
      },
    })
  }
}

export default adapter
