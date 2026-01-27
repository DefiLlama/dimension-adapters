import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.FLOW]: {
        start: '2025-01-14',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xbC92aaC2DBBF42215248B5688eB3D3d2b32F2c8d',
            dataProvider: '0x79e71e3c0EDF2B88b0aB38E9A1eF0F6a230e56bf',
          },
        ],
      },
    })
  }
}

export default adapter
