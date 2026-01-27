import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.ARBITRUM]: {
        start: '2024-04-02',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x3Ff516B89ea72585af520B64285ECa5E4a0A8986',
            dataProvider: '0x8Cb093763cD2EB1e418eaEFfFC4f20c1665304a2',
          },
        ],
      },
    })
  }
}

export default adapter
