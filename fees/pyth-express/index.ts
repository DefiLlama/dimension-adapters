import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";
import { queryDuneSql } from "../../helpers/dune";

// Express Relay DAO fee collection address
// Collects both native SOL and SPL tokens (USDC, etc.) from MEV auctions
const EXPRESS_RELAY_DAO_ADDRESS = "69ib85nGQS2Hzr4tQ8twbkGh76gKFUfWJFeJfQ37R3hW";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // 1. Track native SOL received via account_activity table
  // This captures direct SOL transfers that getSolanaReceivedDune misses
  const nativeSolQuery = `
    SELECT 
      COALESCE(SUM(balance_change), 0) / 1e9 AS sol_received
    FROM solana.account_activity
    WHERE address = '${EXPRESS_RELAY_DAO_ADDRESS}'
      AND tx_success = TRUE
      AND balance_change > 0
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `;

  try {
    const solResult = await queryDuneSql(options, nativeSolQuery);
    const solReceived = solResult[0]?.sol_received || 0;
    
    if (solReceived > 0) {
      // Add native SOL using CoinGecko price
      dailyFees.addCGToken("solana", solReceived);
    }
  } catch (e) {
    console.error("Pyth Express Relay: Error fetching native SOL", e);
  }

  // 2. Track SPL tokens (USDC, etc.) received
  // This uses the existing helper that queries tokens_solana.transfers
  try {
    const splTokenFees = await getSolanaReceivedDune({
      options,
      target: EXPRESS_RELAY_DAO_ADDRESS,
    });
    
    // Merge SPL token balances into dailyFees
    dailyFees.addBalances(splTokenFees);
  } catch (e) {
    console.error("Pyth Express Relay: Error fetching SPL tokens", e);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees, // All fees go to DAO as revenue
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees collected from Express Relay MEV auctions. Includes native SOL and SPL tokens (USDC, etc.) received by the DAO address.",
    Revenue: "All auction fees accrue to the Pyth DAO treasury.",
  },
};

export default adapter;
