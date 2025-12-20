//fees/swim-protocol.ts
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTokenBalance } from "../helpers/solana";

// Pool addresses
const POOLS = [
  "SWiMBJS9iBU1rMLAKBVfp73ThW1xPPwKdBHEU2JFpuo", // 4 token pool
  "SWiMDJYFUGj6cPrQ6QYYYWZtvXQdRChSVAygDZDsCHC", // 6 token pool
];

const fetch = async (_options: FetchOptions) => {
  // Since Swim Protocol is inactive, return 0
  // or try to fetch historical data if needed
  
  return {
    dailyFees: "0",
    dailyRevenue: "0",
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2022-03-09',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;