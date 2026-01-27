import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.HYPERLIQUID]: {
        start: '2025-03-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x8Cc02b048deA40d8D0D13eac9866F5bb42D3F4E9',
            dataProvider: '0xf8b130AaF759C24d91BeC7Dd64e4A82D2CF51194',
          },
          {
            version: 3,
            lendingPoolProxy: '0xC0Fd3F8e8b0334077c9f342671be6f1a53001F12',
            dataProvider: '0x022f164ddba35a994ad0f001705e9c187156e244',
          },
        ],
      },
    })
  }
}

export default adapter
