import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// HypurrQuant — non-custodial DeFi terminal / swap & LP aggregator on HyperEVM.
// It routes user swaps through underlying aggregators (LiquidSwap, HyperBloom,
// Relay, deBridge), passing its own fee recipient + fee bps so those routers pay
// HypurrQuant a 0.05% integrator fee into a DEDICATED fee-collector wallet.
// We derive HypurrQuant's own routed volume from that integrator fee, so the
// underlying DEX volume is NOT double-counted.
//
// Source — public app config, exposed in the client bundle (not a secret):
//   FEE_RECIPIENT  = NEXT_PUBLIC_ROUTING_FEE_RECIPIENT
//   FEE_BPS        = NEXT_PUBLIC_ROUTING_FEE_BPS  (5 = 0.05%)
//   App / config ref: https://hypurrquant.com  (routing fee, getRoutingFee()).
const FEE_RECIPIENT = "0x362294a899B304C933135781Bb1f976ed8062781"; // dedicated integrator-fee wallet
const FEE_BPS = 5; // 0.05% integrator fee -> feeFraction = FEE_BPS / 10_000

const fetch = async (options: FetchOptions) => {
  // The fee recipient is a dedicated integrator-fee collector: its inflows are
  // the 0.05% routing fee paid by the aggregators HypurrQuant routes through.
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
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-12-01",
  methodology: {
    Fees: "0.05% integrator fee HypurrQuant earns on the swaps it routes (via LiquidSwap, HyperBloom, Relay, deBridge), measured as token transfers into its dedicated fee-recipient wallet.",
    Revenue: "All integrator fees are HypurrQuant protocol revenue.",
    ProtocolRevenue: "All integrator fees are HypurrQuant protocol revenue.",
    Volume: "Swap volume routed through HypurrQuant, derived from its 0.05% integrator fee (fees / 0.0005). Underlying DEX volume is not double-counted.",
  },
};

export default adapter;
