// DefiLlama dimension-adapters fees/revenue adapter for AGNT (my.agnt.social)
// Fork path: dimension-adapters/fees/agnt/index.ts
//
// Method: Clanker-style claimed fees (fees/clanker.ts) — count WETH received by the
// AGNT platform fee wallet, which the Doppler launchpad releases on fee claims.
// The SAME wallet + 32/63/5 beneficiary split applies on every chain AGNT launches
// on; only the WETH address and the fee-releasing initializers differ per chain.
//
// Chains:
//   • Base (8453) — original launchpad. Platform wallet 0x5bF5805e… receives WETH
//     from the two Doppler initializers on fee claims. Trading: 0.40% in-app swap
//     fee withdrawn from Relay's claim contract as USDC (Base only).
//   • Robinhood Chain (4663) — AGNT's newer launchpad. Same 32% platform WETH share,
//     released by the RH Doppler initializers to the same wallet. Added 2026-07-29
//     after automated fee collection began landing RH fees on-chain; without this the
//     adapter reported ~$0 because AGNT's launch volume moved to RH + Solana.
//
// Not yet covered: Solana launch fees (agent LP-fee cut to the AGNT treasury — a
// different, non-EVM mechanism; add in a follow-up). The launched-token fee leg is
// still excluded on both EVM chains (unpriced/illiquid) — figures are a WETH-side
// lower bound, consistent with the original Base-only version.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

// AGNT launch-fee platform beneficiary (32% of the 1.095% Doppler terminal pool fee).
const PLATFORM_FEE_WALLET = "0x5bF5805e4809A447a61621f8698CEdeA2D1fC5f0"; // CLAW_FEE_ADDRESS
// Platform keeps 32% of the pool fee → total user-paid fee = platform revenue / 0.32.
const PLATFORM_SHARE = 0.32;
const CREATOR_SHARE = 0.63;
const DOPPLER_SHARE = 0.05;
// Trading: 0.40% in-app swap fee, paid by Relay to a DEDICATED app-fee recipient
// (RELAY_APP_FEE_RECIPIENT) — a different wallet from the launch-fee treasury. Paid
// mostly as WETH straight from Relay's Base settlement contract, plus occasional USDC
// from Relay's claim contract. Filtered to those two senders so only fee inflows
// count (the wallet also sees stray unrelated tokens). AGNT keeps 100%. Base only.
const TRADING_FEE_WALLET = "0x585b685414D6ff141Ed1A4A0dD0837423e440598"; // RELAY_APP_FEE_RECIPIENT
const RELAY_SETTLEMENT = "0xc7F712b7e7A561eFEe674955125BD2f0243200C4"; // Relay Base settlement (pays WETH app fee)
const RELAY_CLAIM_CONTRACT = "0xf70da97812cb96acdf810712aa562db8dfa3dbef"; // Relay claim (occasional USDC)

// Per-chain config. Same platform wallet + beneficiary split everywhere; only the WETH
// deployment and the fee-releasing Doppler initializers differ. The wrong initializer
// simply never sent WETH to the wallet, so the fromAdddesses filter is exact per chain.
const CHAIN_CONFIG: Record<string, { weth: string; initializers: string[] }> = {
  [CHAIN.BASE]: {
    weth: CoreAssets.base.WETH,
    initializers: [
      "0xd59ce43e53d69f190e15d9822fb4540dccc91178", // DecayMulticurveInitializer (current)
      "0xbdf938149ac6a781f94faa0ed45e6a0e984c6544", // DopplerHookInitializer (legacy)
    ],
  },
  [CHAIN.ROBINHOOD]: {
    // Robinhood Chain WETH is RH's own deployment, NOT the OP-stack 0x42..0006.
    weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    initializers: [
      "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544", // dopplerHookInitializer (4663)
      "0x6f02324d20cc679d0e585290caa6b16bacbc0f77", // rehypeDopplerHookInitializer (4663)
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const cfg = CHAIN_CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Platform's 32% launch-fee share (WETH leg), released by the Doppler initializers.
  // CONSERVATIVE: the launched-token leg of the fee is excluded (unpriced/illiquid) —
  // figures are a WETH-side lower bound.
  const revenue = await addTokensReceived({
    options,
    targets: [PLATFORM_FEE_WALLET],
    tokens: [cfg.weth],
    fromAdddesses: cfg.initializers, // count only fee releases (helper param spelled fromAdddesses)
  });

  dailyRevenue.addBalances(revenue, "Launchpad Fees to Protocol");
  dailyFees.addBalances(revenue.clone(1 / PLATFORM_SHARE), "Launchpad Fees");
  dailySupplySideRevenue.addBalances(revenue.clone(CREATOR_SHARE / PLATFORM_SHARE), "Launchpad Fees to Creators");
  dailySupplySideRevenue.addBalances(revenue.clone(DOPPLER_SHARE / PLATFORM_SHARE), "Launchpad Fees to Doppler");

  // Trading fees — Base only. Relay pays the 0.40% app fee to the dedicated app-fee
  // recipient: WETH from its settlement contract, occasional USDC from its claim
  // contract. Both senders whitelisted so unrelated inflows don't count. AGNT keeps
  // 100%, so trading fees == trading revenue.
  if (options.chain === CHAIN.BASE) {
    const tradingFees = await addTokensReceived({
      options,
      targets: [TRADING_FEE_WALLET],
      tokens: [CoreAssets.base.WETH, CoreAssets.base.USDC],
      fromAdddesses: [RELAY_SETTLEMENT, RELAY_CLAIM_CONTRACT],
    });
    dailyFees.addBalances(tradingFees, "Trading Fees");
    dailyRevenue.addBalances(tradingFees, "Trading Fees to Protocol");
  }

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
  chains: [CHAIN.BASE, CHAIN.ROBINHOOD],
  start: "2026-07-15",
  methodology: {
    Fees: "Total fees paid by users on AGNT: (1) the 1.095% Doppler V4 terminal pool fee on tokens launched via the launchpad on Base + Robinhood Chain, derived from the observed on-chain platform fee share (WETH leg only — conservative lower bound); plus (2) the 0.40% platform fee on in-app swaps (Base), measured as WETH + USDC paid by Relay to AGNT's app-fee recipient wallet.",
    Revenue: "Fees kept by AGNT: the 32% platform share of launchpad pool fees (WETH released by the Doppler initializers on Base + Robinhood, to 0x5bF5805e…C5f0) plus 100% of the 0.40% swap fee (WETH + USDC paid by Relay on Base to the app-fee recipient 0x585b6854…0598).",
    ProtocolRevenue: "Same as Revenue — all AGNT launchpad fees accrue to the platform treasury.",
    SupplySideRevenue: "The 68% of launchpad pool fees paid to third-party token creators (63%) and the Doppler protocol (~5%), estimated from the observed platform WETH share.",
  },
  breakdownMethodology: {
    Fees: {
      "Launchpad Fees": "1.095% Doppler terminal fee (WETH leg), estimated as platform WETH share / 0.32, on Base + Robinhood Chain.",
      "Trading Fees": "0.40% swap fee (Base), WETH + USDC paid by Relay to the app-fee recipient wallet.",
    },
    Revenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to the fee wallet on Base + Robinhood",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, WETH + USDC paid by Relay to the app-fee recipient (Base)",
    },
    ProtocolRevenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to the fee wallet on Base + Robinhood",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, WETH + USDC paid by Relay to the app-fee recipient (Base)",
    },
    SupplySideRevenue: {
      "Launchpad Fees to Creators": "63% of launchpad pool fees paid to third-party token creators",
      "Launchpad Fees to Doppler": "5% of launchpad pool fees paid to the Doppler protocol",
    },
  },
  // Launchpad fees are Uniswap V4 pool fees (double-counted under Uniswap). The trading
  // fee is a separate app surcharge (not double-counted), but it's negligible vs launchpad
  // at current scale — revisit splitting if trading volume grows materially.
  doublecounted: true, // uniswap (launchpad leg)
};

export default adapter;
