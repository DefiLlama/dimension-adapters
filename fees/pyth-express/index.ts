import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

// Express Relay DAO fee collection address
// Collects both SOL and USDC from MEV auctions
const EXPRESS_RELAY_DAO_ADDRESS = "69ib85nGQS2Hzr4tQ8twbkGh76gKFUfWJFeJfQ37R3hW";

const fetch = async (options: FetchOptions) => {
  // Track all tokens (SOL and USDC) received by the DAO address
  const received = await getSolanaReceived({
    options,
    target: EXPRESS_RELAY_DAO_ADDRESS,
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addBalances(received, "Express Relay Fees");
  dailyRevenue.addBalances(received, "Express Relay Fees To Pyth DAO"); // All fees go to DAO as revenue

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees collected from Express Relay priority auctions (SOL and USDC)",
    Revenue: "All Express Relay auction fees accrue to the Pyth DAO",
  },
  breakdownMethodology: {
    Fees: {
      "Express Relay Fees": "Fees collected from Express Relay priority auctions (SOL and USDC)",
    },
    Revenue: {
      "Express Relay Fees To Pyth DAO": "All Express Relay auction fees accrue to the Pyth DAO",
    },
  },
};

export default adapter;
