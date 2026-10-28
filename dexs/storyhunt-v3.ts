import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// on-chain swap logs; the app.storyhunt.xyz/api/graph subgraph proxy returns 404.
// factory from DefiLlama-Adapters registries/uniswapV3.js
// volume only, as before: per-pool feeProtocol differs (0, 1/4, 1/5) so fees/revenue need their own review
export default uniV3Exports({
  [CHAIN.STORY]: {
    factory: '0xa111dDbE973094F949D78Ad755cd560F8737B7e2',
    customLogic: ({ dailyVolume }: any) => ({ dailyVolume }),
  },
});
