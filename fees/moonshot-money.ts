import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      meta: {
        methodology: {
          Fees: 'All buy/sell fees paid by users for using Moonshot App.',
          Revenue: 'All fees are collected by Moonshot App.',
          ProtocolRevenue: 'All fees are collected by Moonshot App.',
        }
      }
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
