import {
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const FEE_WALLET = "Bkfx4XwD9VuztHyimbKyte2zkv78eBRHyeq4CvG6RFdB";
const HIST_START = 1752134400;

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  await getSolanaReceived({
    options,
    balances: dailyFees,
    target: FEE_WALLET,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: HIST_START,
      meta: {
        methodology: {
          Fees: "Fees are calculated by tracking all SOL and SPL token inflows to the designated fee wallet: Bkfx4XwD9VuztHyimbKyte2zkv78eBRHyeq4CvG6RFdB.",
          Revenue: "All collected fees are considered protocol revenue.",
        },
      },
    },
  },
};

export default adapter;
