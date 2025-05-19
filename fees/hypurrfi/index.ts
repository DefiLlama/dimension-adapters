import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { aaveExport } from "../../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.HYPERLIQUID]: {
        start: '2025-02-20',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xcecce0eb9dd2ef7996e01e25dd70e461f918a14b',
            dataProvider: '0x895c799a5bbdcb63b80bee5bd94e7b9138d977d6',
          },
        ],
      },
    })
  }
}

export default adapter

