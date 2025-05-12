import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.BSC]: {
        start: '2022-03-20',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0xE29A55A6AEFf5C8B1beedE5bCF2F0Cb3AF8F91f5',
            dataProvider: '0xc9704604E18982007fdEA348e8DDc7CC652E34cA',
          },
        ],
      },
    })
  }
}

export default adapter
