import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const usdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const usdce = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, tokens: [usdc, usdce], targets: [
      '0x1b5e59759577fa0079e2a35bc89143bc0603d546',
      '0xD5aC6419635Aa6352EbaDe0Ab42d25FbFa570D21',
    ]
  })

  return { dailyFees, }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: 1691596800,
      meta: {
        methodology: {
          UserFees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
          Fees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
        },
      },
    },
  },
};
export default adapter;
