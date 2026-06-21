import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// HypurrQuant — non-custodial DeFi terminal / swap & LP aggregator on HyperEVM.
// It routes swaps through underlying aggregators (LiquidSwap, HyperBloom, Relay,
// deBridge) and earns a 0.05% integrator fee that is paid into its fee-recipient
// wallet. We derive HypurrQuant's own routed volume from that integrator fee
// (token transfers into the fee wallet), so the underlying DEX volume is NOT
// double-counted.
const FEE_RECIPIENT = "0x362294a899B304C933135781Bb1f976ed8062781";
const FEE_BPS = 5; // 0.05% integrator fee -> feeFraction = FEE_BPS / 10_000

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ options, target: FEE_RECIPIENT });
  // Routed volume = integrator fees / fee fraction (0.05%).
  const dailyVolume = dailyFees.clone(10_000 / FEE_BPS);
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-12-01",
  methodology: {
    Fees: "0.05% integrator fee HypurrQuant earns on the swaps it routes, measured as token transfers into its fee-recipient wallet.",
    Revenue: "All integrator fees are HypurrQuant protocol revenue.",
    ProtocolRevenue: "All integrator fees are HypurrQuant protocol revenue.",
    Volume: "Swap volume routed through HypurrQuant, derived from its 0.05% integrator fee (fees / 0.0005). Underlying DEX volume is not double-counted.",
  },
};

export default adapter;
