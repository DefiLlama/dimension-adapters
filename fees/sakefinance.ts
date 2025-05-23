import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.SONEIUM]: {
        start: '2025-01-09',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3C3987A310ee13F7B8cBBe21D97D4436ba5E4B5f',
            dataProvider: '0x2BECa16DAa6Decf9C6F85eBA8F0B35696A3200b3',
          },
          {
            version: 3,
            lendingPoolProxy: '0x0Bd12d3C4E794cf9919618E2bC71Bdd0C4FF1cF6',
            dataProvider: '0x3b5FDb25672A0ea560E66905B97d0c818a00f5eb',
          },
        ],
      },
    })
  }
}

export default adapter
