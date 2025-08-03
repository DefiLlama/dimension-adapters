import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.OPTIMISM]: {
        start: '2024-11-07',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x345D2827f36621b02B783f7D5004B4a2fec00186',
            dataProvider: '0xCC61E9470B5f0CE21a3F6255c73032B47AaeA9C0',
          },
        ],
      },
      [CHAIN.BASE]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x09b11746DFD1b5a8325e30943F8B3D5000922E03',
            dataProvider: '0x1566DA4640b6a0b32fF309b07b8df6Ade40fd98D',
          },
        ],
      },
    })
  }
}

export default adapter
