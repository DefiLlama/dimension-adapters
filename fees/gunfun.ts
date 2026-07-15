import { FetchOptions, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: 'DoX6NFeLnSgeQsCYKAtUVCPtXZo6xBsyJFCBaXW3crQK' });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-02-07',
    },
  },
  isExpensiveAdapter: true,
  pullHourly: true,
  methodology: {
    Fees: "Users pay a platform fee of 1.5% on presales and memecoin transactions on Gunfun.",
    Revenue: "Protocol collects a 1.5% fee on all presales and memecoin transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallet: DoX6NFeLnSgeQsCYKAtUVCPtXZo6xBsyJFCBaXW3crQK."
  }
};

export default adapter;
