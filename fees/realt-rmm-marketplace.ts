import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.XDAI]: {
        start: '2022-01-22',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x5B8D36De471880Ee21936f328AAB2383a280CB2A',
            dataProvider: '0x8956488Dc17ceA7cBEC19388aEbDB37273F523BE',
          },
        ],
      },
    })
  }
}

export default adapter
