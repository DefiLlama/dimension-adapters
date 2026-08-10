import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const FEE_WALLET = "Bkfx4XwD9VuztHyimbKyte2zkv78eBRHyeq4CvG6RFdB";

const fetch = async (options: FetchOptions) => {
  const tempBalances = options.createBalances();
  await getSolanaReceived({
    options,
    balances: tempBalances,
    target: FEE_WALLET,
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(tempBalances, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees charged by the trading bot for executing swaps on behalf of users',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-08',
  methodology: {
    Fees: "Fees collected from the swaps.",
    Revenue: "All collected fees are protocol revenue.",
    ProtocolRevenue: "100% fees goes to the protocol.",
  },
  breakdownMethodology,
};

export default adapter;
