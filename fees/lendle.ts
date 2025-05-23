import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.MANTLE]: {
        start: '2022-03-20',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3',
            dataProvider: '0x552b9e4bae485C4B7F540777d7D25614CdB84773',
          },
        ],
      },
    })
  }
}

export default adapter
