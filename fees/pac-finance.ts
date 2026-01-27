import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.BLAST]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xd2499b3c8611E36ca89A70Fda2A72C49eE19eAa8',
            dataProvider: '0x742316f430002D067dC273469236D0F3670bE446',
          },
        ],
      },
    })
  }
}

export default adapter
