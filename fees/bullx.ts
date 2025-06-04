import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

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
      start: '2024-05-14',
      meta: {
        methodology: {
          Fees: "All trading fees paid by users while using BullX bot.",
          Revenue: "Trading fees are collected by BullX protocol."
        }
      }
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
