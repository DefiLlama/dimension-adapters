import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
      '0xc8c0e780960f954c3426a32b6ab453248d632b59'
    ], fromAdddesses: [
      "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", // uniswap on base, ethereum
      "0x5E325eDA8064b456f4781070C0738d849c824258", // uniswap on arbitrum
      "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265", // uniswap on bsc
      "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416", // pancake on bsc
      "0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8", // uniswap on optimism
      "0xFE6508f0015C778Bdcc1fB5465bA5ebE224C9912", // pancake on arbitrum
      "0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2", // uniswap on polygon
      "0x643770E279d5D0733F21d6DC03A8efbABf3255B4", // uniswap on blast
    ]
  })

  return { dailyFees, dailyRevenue: dailyFees }
};

const start = 1712710800
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start },
    [CHAIN.BASE]: { fetch, start },
    [CHAIN.ARBITRUM]: { fetch, start },
    [CHAIN.POLYGON]: { fetch, start },
    [CHAIN.BSC]: { fetch, start },
    [CHAIN.OPTIMISM]: { fetch, start },
  },
};
export default adapter;
