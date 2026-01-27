import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.CORE]: {
        start: '2024-04-16',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x0cea9f0f49f30d376390e480ba32f903b43b19c5',
            dataProvider: '0x567af83d912c85c7a66d093e41d92676fa9076e3',
          },
        ],
      },
    })
  }
}

export default adapter
