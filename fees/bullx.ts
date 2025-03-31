import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const targets = [
    'F4hJ3Ee3c5UuaorKAMfELBjYCjiiLH75haZTKqTywRP3',
    '9RYJ3qr5eU5xAooqVcbmdeusjcViL5Nkiq7Gske3tiKq',
  ]

  const dailyFees = await getSolanaReceived({ options, targets, });
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-05-14'
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
