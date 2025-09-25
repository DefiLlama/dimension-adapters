import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.BSC]: {
        start: '2023-09-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xcb0620b181140e57d1c0d8b724cde623ca963c8c',
            dataProvider: '0x09ddc4ae826601b0f9671b9edffdf75e7e6f5d61',
          },
        ],
      },
      [CHAIN.OP_BNB]: {
        start: '2023-10-12',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3Aadc38eBAbD6919Fbd00C118Ae6808CBfE441CB',
            dataProvider: '0xBb5f2d30c0fC9B0f71f7B19DaF19e7Cf3D23eb5E',
          },
        ],
      },
      [CHAIN.ETHEREUM]: {
        start: '2024-03-26',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xeA14474946C59Dee1F103aD517132B3F19Cef1bE',
            dataProvider: '0xE44990a8a732605Eddc0870597d2Cf4A2637F038',
          },
        ],
      },
      [CHAIN.MANTLE]: {
        start: '2024-05-117',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x5757b15f60331eF3eDb11b16ab0ae72aE678Ed51',
            dataProvider: '0x18cc2c55b429EE08748951bBD33FF2e68c95ec38',
          },
        ],
      },
    })
  }
}

export default adapter
