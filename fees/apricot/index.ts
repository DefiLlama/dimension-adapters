import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";

const APRICOT_MAIN_POOL = "7Ne6h2w3LpTNTa7CNYcUs7UkjeJT3oW7jcrXWfVScTXW";

const methodology = {
  Fees: "Interest paid by borrowers on the Apricot Finance lending protocol when they repay loans, plus performance fees from LP token farming (20%) and recursive loan fees (0.075%)",
  Revenue: "20% of all lending interest paid by borrowers goes to the protocol treasury. Additionally, 20% performance fee on LP farming earnings and 0.075% on recursive loans",
  ProtocolRevenue: "Protocol revenue includes 20% of borrow interest, 20% of farming rewards, and recursive loan fees",
  SupplySideRevenue: "80% of lending interest is distributed to depositors"
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  await getSolanaReceivedDune({
    options,
    balances: dailyFees,
    target: APRICOT_MAIN_POOL,
  });

  // Since protocol takes 20% as revenue, 80% goes to depositors
  const dailyRevenue = dailyFees.clone(0.2);
  const dailySupplySideRevenue = dailyFees.clone(0.8);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2021-08-25',
    },
  },
  methodology,
};

export default adapter;
