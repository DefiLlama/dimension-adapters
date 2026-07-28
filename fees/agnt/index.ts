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

  dailyRevenue.addBalances(revenue);
  dailyFees.addBalances(revenue.clone(1 / PLATFORM_SHARE));
  dailySupplySideRevenue.addBalances(revenue.clone((1 - PLATFORM_SHARE) / PLATFORM_SHARE));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-07-15", // first platform WETH release to 0x5bF5805e… (verified on Base).
  methodology: {
    Fees: "Estimated total fees paid by users on tokens launched via the AGNT launchpad (Doppler V4 on Base): the 1.095% terminal pool fee, derived from the observed on-chain platform fee share. CONSERVATIVE — only the WETH leg is measured (launched-token leg excluded), so figures are a lower bound. In-app swap (trading) fees are not yet included.",
    Revenue: "Fees kept by AGNT: the 32% platform share of launchpad pool fees, measured as WETH released to the platform fee wallet 0x5bF5805e…C5f0 by the Doppler initializers.",
    ProtocolRevenue: "Same as Revenue — all AGNT launchpad fees accrue to the platform treasury.",
    SupplySideRevenue: "The 68% of launchpad pool fees paid to third-party token creators (63%) and the Doppler protocol (~5%), estimated from the observed platform WETH share.",
  },
  breakdownMethodology: {
    Fees: { "Launchpad Fees": "1.095% Doppler terminal fee (WETH leg), estimated as platform WETH share / 0.32." },
    Revenue: { "Launchpad Fees": "32% platform share, WETH released to 0x5bF5805e…C5f0." },
  },
};

export default adapter;
