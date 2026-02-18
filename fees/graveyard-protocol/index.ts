import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const FEE_COLLECTOR_WALLET = "GRAVEbqZNUN1K7WBgvwgWUYs69M51eprZbSkeXWbQjjE";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  // Track SOL inflows to fee collector wallet
  // This captures the fees = 10% of rent reclaim 
  await getSolanaReceived({
    options,
    balances: dailyFees,
    target: FEE_COLLECTOR_WALLET,
    mints: ["So11111111111111111111111111111111111111112"],  // native SOL only
  });

  // 100% of fees go to protocol (no token holders):
  return {
    dailyFees,                    // 10% of total sol rent reclaimed
    dailyUserFees: dailyFees,     // Users "paid" via rent reclamation - Same as above.
    dailyRevenue: dailyFees,      // 10% fee = protocol revenue - Same as above.
    dailyProtocolRevenue: dailyFees, // All revenue goes to treasury - Same as above.
  };
};

const methodology = {
  Fees: "Users pay service fees equal to 10% of total rent reclaimed by closing ATAs.",
  UserFees: "Users pay service fees equal to 10% of total rent reclaimed by closing ATAs.",
  Revenue: "100% of fees is collected as protocol revenue.",
  ProtocolRevenue: "100% of fees is collected as protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2, // Recommended: supports arbitrary time ranges
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  methodology,
};

export default adapter;
