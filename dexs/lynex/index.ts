import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

// const fetch = univ2Adapter2({
//   endpoints: {
//     // [CHAIN.LINEA]: "https://api.goldsky.com/api/public/project_cltyhthusbmxp01s95k9l8a1u/subgraphs/lynex-cl/v1.0.2/gn"
//     [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/59052/lynex-cl/v1.0.1"
//   },
//   factoriesName: "factories",
//   totalVolume: "totalVolumeUSD",
// })

// const adapter: SimpleAdapter = {
//   version: 2,
//   fetch,
//   chains: [CHAIN.LINEA],
//   start: '2023-08-07',
// }

export default {
  ...uniV3Exports({
    [CHAIN.LINEA]: {
      factory: '0x622b2c98123D303ae067DB4925CD6282B3A08D0F',
      isAlgebraV2: true,
      poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
      swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)',
    }
  }, { runAsV1: true }),
  start: '2023-08-07',
}
