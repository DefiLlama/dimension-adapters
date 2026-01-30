import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

// Express Relay DAO fee collection address
// Collects both SOL and USDC from MEV auctions
const EXPRESS_RELAY_DAO_ADDRESS = "69ib85nGQS2Hzr4tQ8twbkGh76gKFUfWJFeJfQ37R3hW";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // Track all tokens (SOL and USDC) received by the DAO address
  const dailyFees = await getSolanaReceived({
    options,
    target: EXPRESS_RELAY_DAO_ADDRESS,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees, // All fees go to DAO as revenue
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-01-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees collected from Express Relay MEV auctions (SOL and USDC)",
    Revenue: "All auction fees accrue to the Pyth DAO",
  },
};

export default adapter;
