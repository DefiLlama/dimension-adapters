import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import CoreAssets from "../../helpers/coreAssets.json";

const FEE_WALLET = "BheyYMXLPogbJcw2bpKHa7qKFqREQ6rFtn4KqwrjqJ7R";

const FEE_MINTS = [CoreAssets.solana.USDC, CoreAssets.solana.USDT, CoreAssets.solana.SOL];

const fetch = async (options: FetchOptions) => {
  const dailyPlatformFees = options.createBalances();

  await getSolanaReceived({
    options,
    balances: dailyPlatformFees,
    target: FEE_WALLET,
    mints: FEE_MINTS,
  });

  const dailyFees = dailyPlatformFees.clone(1, 'Platform Fees');
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  Revenue: "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  ProtocolRevenue: "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
}

const breakdownMethodology = {
  Fees: {
    'Platform Fees': "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  },
  Revenue: {
    'Platform Fees': "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  },
  ProtocolRevenue: {
    'Platform Fees': "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-21",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
