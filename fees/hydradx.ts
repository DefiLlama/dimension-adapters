import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.CORE]: {
        start: '2024-11-26',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x1b02E051683b5cfaC5929C25E84adb26ECf87B38',
            dataProvider: '0x112b087b60C1a166130d59266363C45F8aa99db0',
          },
        ],
      },
    })
  }
}

export default adapter
