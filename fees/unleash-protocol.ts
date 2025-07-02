import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.STORY]: {
        start: '2025-02-13',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xC62Af8aa9E2358884B6e522900F91d3c924e1b38',
            dataProvider: '0x970C24ABaEA0dddf1b1C328237001c74Bb96c9e4',
          },
        ],
      },
    })
  }
}

export default adapter
