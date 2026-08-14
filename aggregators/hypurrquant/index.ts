import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// HypurrQuant is a self-custodial crypto wealth management app on HyperEVM (the
// Hyperliquid ecosystem): users grow and manage an on-chain portfolio across
// liquidity provision, swaps, perps and yield, while keeping custody of their
// assets via account abstraction. This adapter tracks the swap-routing feature:
// HypurrQuant routes user swaps through underlying aggregators (LiquidSwap,
// HyperBloom, Relay, deBridge), passing its own fee recipient + fee bps so those
// routers pay HypurrQuant a 0.05% integrator fee. We derive HypurrQuant's routed
// volume from that integrator fee, so the underlying DEX volume is NOT double-counted.
//
// Source — public app config, exposed in the client bundle (not a secret):
//   FEE_RECIPIENT  = NEXT_PUBLIC_ROUTING_FEE_RECIPIENT
//   FEE_BPS        = NEXT_PUBLIC_ROUTING_FEE_BPS  (5 = 0.05%)
//   App / config ref: https://hypurrquant.com  (routing fee, getRoutingFee()).
const FEE_RECIPIENT = "0x362294a899B304C933135781Bb1f976ed8062781";
const FEE_BPS = 5; // 0.05% integrator fee -> feeFraction = FEE_BPS / 10_000

// The fee recipient is mixed-use (it also receives lending receipt tokens and
// reward-claim inflows), so we count ONLY transfers from the swap routers/settlers
// that pay the integrator fee. Each address below was identified from the fee
// wallet's on-chain inbound transfers; the role + a representative fee-paying tx
// are noted so the allowlist can be re-validated. Append new routers as routing
// expands. (Lending mint from 0x0 and aggregateClaim/NEST sources are excluded.)
const SWAP_FEE_SOURCES = [
  "0xce8d068708566607d6c9e4333221fa17bfaa9548", // settler — tx 0x9b3014bf024ee1ce55d2db1458ea3779b6fdb936acb58b9298f486b5ee14c562
  "0x744489ee3d540777a66f2cf297479745e0852f7a", // settler — tx 0x55d919b33749c1820966ce836bb9b2c2c8bcdeab086d7cfbe88428d75c6b97f7
  "0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251", // swap()  — tx 0xb1240eb485244aa7f2549ec41efcb9db4b010a1f7b719c7886f3a91610c2b5f5
  "0xeaf58788a405f3253814b4559391a22be8616250", // multicall — tx 0x2310d7572665bcc36007b84dd12c75b3496189b895203f314689ca5179ac6f1f
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // swap()  — tx 0x775985b5e9b97178729664b428db894b354ee340b0c8cd364a2c2598d231fedb
  "0xdb544d63d32d9f3e52ff3a8bfe2a374df0463f8d", // exactInputSingle — tx 0xe8505dbde6d46ffd1f0d80f9e7dd041dfec711444a02dff1bdc54a2e2e81abf0
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
