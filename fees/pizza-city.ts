import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Contract addresses (Base Mainnet)
const BOSS_BAKER_AUCTION = '0x272cD704E5A90b63E3B595744785262d32997B2f';

// WETH on Base  
const WETH = '0x4200000000000000000000000000000000000006';

/**
 * Fetch daily fees from Pizza City Dutch auctions
 * 
 * RoundClearable event is emitted when a round becomes clearable (pot >= price)
 * Contains the final totalPot for that round - all ETH bid into the auction.
 * 
 * Revenue distribution per round:
 * - 80% to Boss Bakers (previous round winners) → Supply Side
 * - 15% to Treasury (builds permanent LP) → Protocol Revenue
 * - 5% to Street Fees (UI/referrals) → Supply Side
 * - 0.1% to Settler (tx executor) → Supply Side
 */
const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  // Fetch RoundClearable events - emitted when round reaches clearing price
  const logs = await getLogs({
    target: BOSS_BAKER_AUCTION,
    eventAbi: 'event RoundClearable(uint256 indexed roundId, uint256 clearingPrice, uint256 totalPot, uint256 bidderCount)',
  });

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Each RoundClearable event represents a completed round with its final pot
  for (const log of logs) {
    const totalPot = log.totalPot;
    
    if (!totalPot || totalPot === 0n) continue;
    
    // Total fees = 100% of pot (all ETH flowing through auctions)
    dailyFees.add(WETH, totalPot);
    
    // Revenue = 100% (all distributed to various parties, nothing burned)
    dailyRevenue.add(WETH, totalPot);
    
    // Protocol Revenue = 15% (Treasury - builds permanent LP)
    dailyProtocolRevenue.add(WETH, totalPot * 15n / 100n);
    
    // Supply Side = 85% (80% Boss Bakers + 5% Street Fees + 0.1% Settler)
    dailySupplySideRevenue.add(WETH, totalPot * 85n / 100n);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-12-19', // First round started Dec 19, 2025 ~6PM UTC
    },
  },
};

export default adapter;
