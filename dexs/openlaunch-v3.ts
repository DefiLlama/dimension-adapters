import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

// Real, unmodified UniswapV3Factory -- every launch's automatic single-sided
// locked position and every permissionlessly-created general pool both go
// through this same factory (see projects/openlaunch/index.js in
// DefiLlama-Adapters for the TVL side of the same distinction).
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.STABLE]: {
      // Protocol-fee switch on the real UniswapV3Factory is currently off
      // (dormant capability, disclosed on /docs/safety) -- 100% of swap fees
      // go to LPs today, 0% to the protocol.
      fetch: getUniV3LogAdapter({ factory: '0xC837ab0f8919Fb47f17b7cD302d88895032e5908', revenueRatio: 0 }),
      start: '2026-08-03',
    },
  },
};

export default adapter;
