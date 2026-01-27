import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.SEI]: {
        start: '2024-06-03',
        pools: [
          {
            version: 3,
            ignoreFlashloan: true,
            ignoreLiquidation: true,
            lendingPoolProxy: '0x4a4d9abd36f923cba0af62a39c01dec2944fb638',
            dataProvider: '0x60c82a40c57736a9c692c42e87a8849fb407f0d6',
          },
        ],
      },
    })
  }
}

export default adapter