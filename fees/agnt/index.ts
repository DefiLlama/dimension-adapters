// DefiLlama dimension-adapters fees/revenue adapter for AGNT (my.agnt.social)
// Fork path: dimension-adapters/fees/agnt/index.ts
//
// Method: Clanker-style claimed fees (fees/clanker.ts) — count WETH received by the
// AGNT platform fee wallet, which the Doppler launchpad releases on fee claims.
//
// On-chain verification (Base, 35-day window, 2026-07-27):
//   • Platform wallet 0x5bF5805e… received 0.0725 WETH in 35 transfers, all since
//     2026-07-15 (this wallet's first fee release) — ~$16/day WETH, ~$500/mo, recent/growing.
//   • ALL 35 came from exactly the 2 Doppler initializers below (x31 + x4) — NO other
//     WETH source. So WETH inflows == fee releases; contamination risk is nil. The
//     fromAdddesses filter below is belt-and-suspenders on an already fee-dedicated leg.
//   • Volume is small. Claimed vs accrued is visually identical at this scale, so the
//     heavy accrued V4 swap-indexing build is deferred until volume grows.
//   • Pre-2026-07-15 launchpad history sits under a prior fee wallet/collector (fee-system-v2
//     flipped beneficiary) — out of scope for this v0; add those addresses to backfill later.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

// AGNT launch-fee platform beneficiary (32% of the 1.095% Doppler terminal pool fee).
const PLATFORM_FEE_WALLET = "0x5bF5805e4809A447a61621f8698CEdeA2D1fC5f0"; // CLAW_FEE_ADDRESS
// The only contracts that release WETH fees to the platform wallet (verified on-chain).
const DOPPLER_INITIALIZERS = [
  "0xd59ce43e53d69f190e15d9822fb4540dccc91178", // DecayMulticurveInitializer (current)
  "0xbdf938149ac6a781f94faa0ed45e6a0e984c6544", // DopplerHookInitializer (legacy)
];
// Platform keeps 32% of the pool fee → total user-paid fee = platform revenue / 0.32.
const PLATFORM_SHARE = 0.32;
const CREATOR_SHARE = 0.63;
const DOPPLER_SHARE = 0.05;
// Trading: 0.40% in-app swap fee, accrued off-chain by Relay and withdrawn to the SAME
// fee wallet as USDC from Relay's claim contract on Base. Filtered to that sender so only
// fee withdrawals count (no prefunding/ops inflows). AGNT keeps 100% of this fee.
const RELAY_CLAIM_CONTRACT = "0xf70da97812cb96acdf810712aa562db8dfa3dbef";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Platform's 32% launch-fee share (WETH leg), released by the Doppler initializers.
  // CONSERVATIVE: the launched-token leg of the fee is excluded (unpriced/illiquid) —
  // figures are a WETH-side lower bound.
  const revenue = await addTokensReceived({
    options,
    targets: [PLATFORM_FEE_WALLET],
    tokens: [CoreAssets.base.WETH],
    fromAdddesses: DOPPLER_INITIALIZERS, // count only fee releases (note: helper's param is spelled fromAdddesses)
  });

  dailyRevenue.addBalances(revenue, "Launchpad Fees to Protocol");
  dailyFees.addBalances(revenue.clone(1 / PLATFORM_SHARE), "Launchpad Fees");
  dailySupplySideRevenue.addBalances(revenue.clone(CREATOR_SHARE / PLATFORM_SHARE), "Launchpad Fees to Creators");
  dailySupplySideRevenue.addBalances(revenue.clone(DOPPLER_SHARE / PLATFORM_SHARE), "Launchpad Fees to Doppler");

  // Trading fees — 0.40% swap fee, USDC withdrawn from Relay's claim contract to the fee
  // wallet. AGNT keeps 100%, so trading fees == trading revenue (no supply side).
  const tradingFees = await addTokensReceived({
    options,
    targets: [PLATFORM_FEE_WALLET],
    tokens: [CoreAssets.base.USDC],
    fromAdddesses: [RELAY_CLAIM_CONTRACT],
  });
  dailyFees.addBalances(tradingFees, "Trading Fees");
  dailyRevenue.addBalances(tradingFees, "Trading Fees to Protocol");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-07-15",
  methodology: {
    Fees: "Total fees paid by users on AGNT (Base): (1) the 1.095% Doppler V4 terminal pool fee on tokens launched via the launchpad, derived from the observed on-chain platform fee share (WETH leg only — conservative lower bound); plus (2) the 0.40% platform fee on in-app swaps, measured as USDC withdrawn from Relay's app-fee claim contract to the fee wallet.",
    Revenue: "Fees kept by AGNT: the 32% platform share of launchpad pool fees (WETH released by the Doppler initializers) plus 100% of the 0.40% swap fee (USDC claimed from Relay), both to the fee wallet 0x5bF5805e…C5f0.",
    ProtocolRevenue: "Same as Revenue — all AGNT launchpad fees accrue to the platform treasury.",
    SupplySideRevenue: "The 68% of launchpad pool fees paid to third-party token creators (63%) and the Doppler protocol (~5%), estimated from the observed platform WETH share.",
  },
  breakdownMethodology: {
    Fees: {
      "Launchpad Fees": "1.095% Doppler terminal fee (WETH leg), estimated as platform WETH share / 0.32.",
      "Trading Fees": "0.40% swap fee, USDC withdrawn from Relay's claim contract to the fee wallet."
    },
    Revenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to fee recipient wallet",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, USDC claimed from Relay to the fee wallet"
    },
    ProtocolRevenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to fee recipient wallet",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, USDC claimed from Relay to the fee wallet"
    },
    SupplySideRevenue: {
      "Launchpad Fees to Creators": "63% of launchpad pool fees paid to third-party token creators",
      "Launchpad Fees to Doppler": "5% of launchpad pool fees paid to the Doppler protocol"
    },
  },
  // Launchpad fees are Uniswap V4 pool fees (double-counted under Uniswap). The trading
  // fee is a separate app surcharge (not double-counted), but it's negligible vs launchpad
  // at current scale — revisit splitting if trading volume grows materially.
  doublecounted: true, // uniswap (launchpad leg)
};

export default adapter;
