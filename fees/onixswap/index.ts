import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const FEE_WALLET = "BheyYMXLPogbJcw2bpKHa7qKFqREQ6rFtn4KqwrjqJ7R";

const FEE_MINTS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "So11111111111111111111111111111111111111112",    // SOL (wrapped)
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  try {
    await getSolanaReceived({
      options,
      balances: dailyFees,
      target: FEE_WALLET,
      mints: FEE_MINTS,
    });
  } catch (e) {
    console.error("[onixswap] getSolanaReceived failed:", e);
    return { dailyFees };
  }

  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-01",
  pullHourly: true,
  methodology: {
    Fees: "0.3% platform fee collected on every swap, filtered to USDC/USDT/SOL inflows to the OnixSwap fee wallet. Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  },
};

export default adapter;
