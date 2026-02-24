import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

//https://docs.tydro.com/resources/addresses
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.INK]: {
        start: '2025-10-13',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
            dataProvider: '0x96086C25d13943C80Ff9a19791a40Df6aFC08328',
          },
        ],
      },
    })
  }
}

export default adapter
