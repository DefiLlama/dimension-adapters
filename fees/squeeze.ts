/**
 * DefiLlama fees adapter draft for Squeeze (https://squeeze.run)
 *
 * Copy this file into DefiLlama/dimension-adapters as:
 *   fees/squeeze.ts
 *
 * Then run (from dimension-adapters):
 *   pnpm i
 *   pnpm test fees squeeze
 *
 * Methodology (on-chain wallet receipts — Clanker / Flaunch style):
 * - EVM (Base + Robinhood): track numeraire tokens + native received by the
 *   Squeeze platform / integrator wallet. That wallet is the Airlock
 *   `integrator` and the 47.5% swap-fee beneficiary on Doppler launches.
 * - Gross pool fees are extrapolated: platform share = 47.5% of pool fees
 *   → dailyFees ≈ dailyRevenue * (100 / 47.5).
 * - Solana: track value received by the LaunchLab claim wallet (platform fees
 *   claimed from pools tagged with Squeeze platformId). Treat 100% of those
 *   receipts as Squeeze protocol revenue (LaunchLab platform fee path).
 *
 * Do NOT invent TVL from Uniswap V4 / Raydium pool balances.
 *
 * Canonical addresses: https://squeeze.run/api/defillama
 * Docs: https://squeeze.run/docs#defillama
 * Source of truth in Squeeze repo: utils/squeezeIntegration.js
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import {
  addTokensReceived,
  getETHReceived,
  getSolanaReceived,
} from "../helpers/token";

/** Canonical Squeeze identity — greppable for reviewers. */
const IDENTITY = {
  /** Platform fee beneficiary + Doppler Airlock integrator (Base + Robinhood). */
  evmFeeWallet: "0x6C61feE73584670AbEd65101946734006DAB12d6",
  /** Base Airlock — filter creates where integrator == evmFeeWallet. */
  baseAirlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
  /** Robinhood Airlock — same integrator filter. */
  robinhoodAirlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
  /** Raydium LaunchLab platformId for Squeeze-tagged pools. */
  solanaPlatformId: "FpKUW9vDSRPTByNu4MerR2SU4YPkJU9pLWQTnChGAW3h",
  /** LaunchLab claim / platform-admin wallet (platform fee destination). */
  solanaClaimWallet: "2qUg6a3yCSATL7stUyJHDBgFJwLW8DXzemZQDePxscws",
} as const;

/**
 * Platform share of Doppler multicurve swap fees.
 * Split: 5% Doppler protocol owner / 47.5% Squeeze / 47.5% creator.
 * @see https://squeeze.run/docs#terminals
 */
const PLATFORM_FEE_SHARE = 0.475;

/** Base numeraires used as Doppler quote tokens. */
const BASE_FEE_TOKENS = [
  "0x4200000000000000000000000000000000000006", // WETH
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
];

/** Robinhood numeraires used as Doppler quote tokens. */
const ROBINHOOD_FEE_TOKENS = [
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", // WETH
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
  "0xF444F3C77C77a33F7c8d8fcab8a1E88aFb843dA5", // SQUEEZE (optional quote)
];

const chainConfig: Record<
  string,
  { start: string; kind: "evm" | "solana"; tokens?: string[] }
> = {
  [CHAIN.BASE]: {
    start: "2025-06-01", // TODO: tighten to first Squeeze Base claim day after local test
    kind: "evm",
    tokens: BASE_FEE_TOKENS,
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-04-20", // Robinhood Chain DefiLlama history start; tighten after test
    kind: "evm",
    tokens: ROBINHOOD_FEE_TOKENS,
  },
  [CHAIN.SOLANA]: {
    start: "2025-06-01", // TODO: tighten to first LaunchLab platform claim
    kind: "solana",
  },
};

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain];
  const dailyRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (cfg.kind === "evm") {
    // ERC-20 numeraires received by the Squeeze fee wallet.
    // Airlocks (IDENTITY.baseAirlock / IDENTITY.robinhoodAirlock) are the
    // create-path identity; v1 tracks the fee wallet receipts instead.
    const erc20 = await addTokensReceived({
      options,
      target: IDENTITY.evmFeeWallet,
      tokens: cfg.tokens,
    });
    dailyRevenue.addBalances(erc20, METRIC.PROTOCOL_FEES);

    // Native ETH / RH gas token received (if any direct native claims).
    // getETHReceived falls back to Allium traces when the chain is not in
    // the named chainMap (covers Robinhood).
    const native = await getETHReceived({
      options,
      target: IDENTITY.evmFeeWallet,
    });
    dailyRevenue.addBalances(native, METRIC.PROTOCOL_FEES);

    // Extrapolate gross pool fees from the 47.5% platform share.
    // Note: 0x affiliate (25 bps) also lands in this wallet and slightly
    // overstates extrapolated fees — acceptable for v1; refine later by
    // filtering transfer senders to Doppler collect paths only.
    //
    // platform 47.5% → gross = revenue / 0.475
    // supply-side (creator 47.5% + Doppler protocol 5%) = 52.5% of gross
    //   = revenue * (0.525 / 0.475)
    dailyFees.addBalances(
      dailyRevenue.clone(1 / PLATFORM_FEE_SHARE),
      METRIC.TRADING_FEES
    );
    dailySupplySideRevenue.addBalances(
      dailyRevenue.clone((1 - PLATFORM_FEE_SHARE) / PLATFORM_FEE_SHARE),
      METRIC.CREATOR_FEES
    );
  } else {
    // Solana: LaunchLab platform fees claimed to the claim wallet.
    // Use getSolanaReceived (not addTokensReceived — that helper is EVM-only).
    // Pools are tagged with IDENTITY.solanaPlatformId; v1 does not filter
    // by platformId yet (wallet is Squeeze-controlled).
    const sol = options.createBalances();
    await getSolanaReceived({
      options,
      balances: sol,
      target: IDENTITY.solanaClaimWallet,
    });
    dailyRevenue.addBalances(sol, METRIC.PROTOCOL_FEES);
    dailyFees.addBalances(sol, METRIC.TRADING_FEES);
    // Creator / Raydium cuts are not in this wallet — leave supply-side empty
    // until a LaunchLab event decoder or Dune query filters by platformId.
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Gross trading fees on Squeeze launches. On Base/Robinhood, Doppler pools charge 2.5%; Squeeze’s platform wallet receives 47.5% of those fees (plus optional 0x affiliate on Squeeze trade proxies). Gross fees are extrapolated from platform receipts. On Solana, LaunchLab platform fees claimed to Squeeze’s claim wallet.",
  Revenue:
    "Squeeze platform share (47.5% of Doppler swap fees on EVM; LaunchLab platform fees on Solana) received by Squeeze-controlled wallets.",
  ProtocolRevenue:
    "Same as Revenue — Squeeze treasury / platform wallet.",
  SupplySideRevenue:
    "On EVM: remainder of extrapolated pool fees (creator 47.5% + Doppler protocol owner 5%). On Solana: not yet attributed in v1.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "User-paid trading fees on Squeeze-launched pools (extrapolated on EVM from 47.5% platform share; Solana = claim-wallet receipts).",
    [METRIC.PROTOCOL_FEES]:
      "Direct protocol fee receipts where not extrapolated.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]:
      "Tokens received by Squeeze platform / claim wallets.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]:
      "Estimated creator (+ Doppler protocol) share of EVM pool fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  // Extrapolated EVM pool fees may overlap Uniswap V4 / Raydium fee dashboards.
  doublecounted: true,
};

export default adapter;
