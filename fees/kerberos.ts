import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0xf82cc5f5bd5fb6a2731cf7903087e8e4e953c434'
    ], fromAdddesses: [
      "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", // uniswap on eth, base
      "0xFE6508f0015C778Bdcc1fB5465bA5ebE224C9912", // pancakeswap on base, arbitrum
      "0x5E325eDA8064b456f4781070C0738d849c824258", // uniswap on arbitrum
      "0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2", // uniswap on polygon
      "0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8", // uniswap optimism
      "0x28731BCC616B5f51dD52CF2e4dF0E78dD1136C06", // uniswap on zksync era,
      "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265", // uniswap on avax, bsc
      "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416", // pancake on bsc
      
    ]
  })

  return { dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: 1727222400, },
    [CHAIN.BASE]: { fetch, start: 1727222400, },
    [CHAIN.ARBITRUM]: { fetch, start: 1727222400, },
    [CHAIN.BSC]: { fetch, start: 1727222400, },
    [CHAIN.POLYGON]: { fetch, start: 1727222400, },
    [CHAIN.ERA]: { fetch, start: 1727222400, },
    [CHAIN.OPTIMISM]: { fetch, start: 1727222400, },
    [CHAIN.AVAX]: { fetch, start: 1727222400, },
  },
};
export default adapter;
