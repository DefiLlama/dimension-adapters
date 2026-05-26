import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const FEE_WALLET = "BheyYMXLPogbJcw2bpKHa7qKFqREQ6rFtn4KqwrjqJ7R";
const FEE_RATE = 0.003;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await getSolanaReceived({
    options,
    balances: dailyFees,
    target: FEE_WALLET,
  });

  const dailyVolume = options.createBalances();
  const feeEntries = (dailyFees as any).getBalances?.() ?? {};
  for (const [token, amount] of Object.entries(feeEntries)) {
    dailyVolume.add(token, Math.round(Number(amount) / FEE_RATE));
  }

  return { dailyFees, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-01",
  methodology: {
    Fees: "Platform fee of 0.3% collected on every swap, received by the OnixSwap fee wallet.",
    Volume: "Total swap volume estimated from fees collected (fees / 0.003). Swaps route through Jupiter v6, Raydium, Orca, and Meteora.",
  },
};

export default adapter;
