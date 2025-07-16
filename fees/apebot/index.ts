import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const FEE_WALLET = "Bkfx4XwD9VuztHyimbKyte2zkv78eBRHyeq4CvG6RFdB";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await getSolanaReceived({
    options,
    balances: dailyFees,
    target: FEE_WALLET,
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-07-08',
      meta: {
        methodology: {
          Fees: "Fees collected from the swaps.",
          Revenue: "All collected fees are protocol revenue.",
          ProtocolRevenue: "100% fees goes to the protocol.",
        },
      },
    },
  },
};

export default adapter;
