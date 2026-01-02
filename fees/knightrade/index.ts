import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenBalance } from "../../helpers/solana";

const FEE_WALLET = "BKVWqzbwXGFqQvnNVfGiM2kSrWiR88fYhFNmJDX5ccyv";

const TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERz9rjXezwPqydat9qYjCCj2LRrPaLd4i8",
  jlUSDC: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
  jlUSDT: "3Xd1xYhGJCPZc1oHffLaRFCob4u8FvnZDJHWi5hWzw3y",
};

// Safe wrapper to handle API failures during local testing
async function getBalanceSafe(token: string, account: string): Promise<number> {
  try {
    return await getTokenBalance(token, account);
  } catch (error) {
    console.warn(`Failed to fetch balance for ${token.substring(0, 8)}... (this is expected in local testing without API keys)`);
    return 0;
  }
}

const fetch = async (
  timestamp: number,
  _chainBlocks: any,
  options: FetchOptions
) => {
  // Fetch all token balances from the fee wallet
  const [usdcBalance, usdtBalance, jlUsdcBalance, jlUsdtBalance] = await Promise.all([
    getBalanceSafe(TOKENS.USDC, FEE_WALLET),
    getBalanceSafe(TOKENS.USDT, FEE_WALLET),
    getBalanceSafe(TOKENS.jlUSDC, FEE_WALLET),
    getBalanceSafe(TOKENS.jlUSDT, FEE_WALLET),
  ]);

  // FEES = USDC + USDT only (raw fee inflows)
  const feesTotal = (usdcBalance || 0) + (usdtBalance || 0);

  // REVENUE = All tokens (fees + yield from jlUSDC/jlUSDT)
  const revenueTotal = 
    (usdcBalance || 0) + 
    (usdtBalance || 0) + 
    (jlUsdcBalance || 0) + 
    (jlUsdtBalance || 0);

  console.log("\n💰 Token Balances:");
  console.log(`   USDC:    ${usdcBalance.toFixed(6)}`);
  console.log(`   USDT:    ${usdtBalance.toFixed(6)}`);
  console.log(`   jlUSDC:  ${jlUsdcBalance.toFixed(6)}`);
  console.log(`   jlUSDT:  ${jlUsdtBalance.toFixed(6)}`);
  console.log("\n💵 Results:");
  console.log(`   Fees:    $${feesTotal.toFixed(2)}`);
  console.log(`   Revenue: $${revenueTotal.toFixed(2)}\n`);

  // Return with proper balance objects if createBalances is available
  if (options && options.createBalances) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    
    dailyFees.addUSDValue(feesTotal);
    dailyRevenue.addUSDValue(revenueTotal);

    return {
      dailyFees,
      dailyRevenue,
    };
  }

  // Fallback for local testing without options
  return {
    timestamp,
    dailyFees: feesTotal,
    dailyRevenue: revenueTotal,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-09-01",
    },
  },
  methodology: {
    Fees: "USDC and USDT inflows to the Knightrade fee wallet from management fees, performance fees, and platform fees.",
    Revenue: "Total value in the fee wallet including USDC/USDT (realized fees) plus jlUSDC/jlUSDT (yield tokens from Jupiter Lend). Revenue includes both direct fee collection and yield generated from deployed capital.",
  },
};

export default adapter;