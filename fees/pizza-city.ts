import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BOSS_BAKER_AUCTION = '0x272cD704E5A90b63E3B595744785262d32997B2f';
const WETH = '0x4200000000000000000000000000000000000006';

const methodology = {
  Fees: "Total ETH bid into Dutch auctions (100% of pot)",
  Revenue: "Protocol revenue only - 15% of auction pot sent to Treasury for permanent LP",
  ProtocolRevenue: "15% of auction pot converted to permanently locked Uniswap V3 liquidity",
  SupplySideRevenue: "85% distributed to participants: 80% to Boss Bakers (previous round winners), 5% to Street Fees (UI/referrals), 0.1% to Settler",
};

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const logs = await getLogs({
    target: BOSS_BAKER_AUCTION,
    eventAbi: 'event RoundClearable(uint256 indexed roundId, uint256 clearingPrice, uint256 totalPot, uint256 bidderCount)',
  });

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  for (const log of logs) {
    const totalPot = log.totalPot;
    if (!totalPot || totalPot === 0n) continue;
    
    // Total fees = 100% of pot (all ETH flowing through auctions)
    dailyFees.add(WETH, totalPot);
    
    // Protocol Revenue = 15% (Treasury - builds permanent LP)
    const protocolShare = totalPot * 15n / 100n;
    dailyProtocolRevenue.add(WETH, protocolShare);
    
    // Revenue = protocolRevenue only (per DefiLlama: revenue = holdersRevenue + protocolRevenue)
    dailyRevenue.add(WETH, protocolShare);
    
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
      start: '2025-12-19',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
