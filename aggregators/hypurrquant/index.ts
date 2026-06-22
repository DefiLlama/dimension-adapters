import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// HypurrQuant — non-custodial DeFi terminal / swap & LP aggregator on HyperEVM.
// It routes user swaps through underlying aggregators (LiquidSwap, HyperBloom,
// Relay, deBridge), passing its own fee recipient + fee bps so those routers pay
// HypurrQuant a 0.05% integrator fee. We derive HypurrQuant's routed volume from
// that integrator fee, so the underlying DEX volume is NOT double-counted.
//
// Source — public app config, exposed in the client bundle (not a secret):
//   FEE_RECIPIENT  = NEXT_PUBLIC_ROUTING_FEE_RECIPIENT
//   FEE_BPS        = NEXT_PUBLIC_ROUTING_FEE_BPS  (5 = 0.05%)
//   App / config ref: https://hypurrquant.com  (routing fee, getRoutingFee()).
const FEE_RECIPIENT = "0x362294a899B304C933135781Bb1f976ed8062781";
const FEE_BPS = 5; // 0.05% integrator fee -> feeFraction = FEE_BPS / 10_000

// The fee recipient also receives non-swap inflows (lending receipt tokens,
// reward claims). To count ONLY swap fees, we scope to the swap router/settler
// contracts that pay the integrator fee (verified on-chain via the fee wallet's
// inbound transfers). Excludes lending (mint/0x0) and NEST reward-claim sources.
// Append new aggregator/router addresses here as routing expands.
const SWAP_FEE_SOURCES = [
  "0xce8d068708566607d6c9e4333221fa17bfaa9548",
  "0x744489ee3d540777a66f2cf297479745e0852f7a",
  "0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251",
  "0xeaf58788a405f3253814b4559391a22be8616250",
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5",
  "0xdb544d63d32d9f3e52ff3a8bfe2a374df0463f8d",
];

const fetch = async (options: FetchOptions) => {
  // Only count integrator-fee transfers from the swap routers/settlers.
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_RECIPIENT,
    fromAdddesses: SWAP_FEE_SOURCES,
  });
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
    Fees: "0.05% integrator fee HypurrQuant earns on routed swaps, counted as transfers from the swap routers/settlers into its fee-recipient wallet (non-swap inflows like lending or reward claims are excluded).",
    Revenue: "All integrator fees are HypurrQuant protocol revenue.",
    ProtocolRevenue: "All integrator fees are HypurrQuant protocol revenue.",
    Volume: "Swap volume routed through HypurrQuant, derived from its 0.05% integrator fee (fees / 0.0005). Underlying DEX volume is not double-counted.",
  },
};

export default adapter;
