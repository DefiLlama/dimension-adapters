/**
 * DefiLlama fees adapter for Squeeze (https://squeeze.run)
 *
 * Methodology (on-chain receipts — Clanker / Flaunch style):
 * - EVM (Base + Robinhood): count numeraire ERC-20s received by the Squeeze
 *   platform wallet **from the chain Airlock** (fee-collect sender). That wallet
 *   is the Airlock `integrator` and the 47.5% swap-fee beneficiary.
 * - Gross pool fees are extrapolated: platform share = 47.5% of pool fees
 *   → dailyFees ≈ dailyRevenue * (100 / 47.5).
 * - Supply-side split of the remaining 52.5%: creator 47.5% + Doppler owner 5%.
 * - Solana: value received by the LaunchLab claim wallet (Squeeze-controlled).
 *   Pools are tagged with `solanaPlatformId`; v1 counts claim-wallet receipts
 *   (platformId event/Dune filter can refine later).
 *
 * Do NOT invent TVL from Uniswap V4 / Raydium pool balances.
 *
 * Canonical addresses: https://squeeze.run/api/defillama
 * Docs: https://squeeze.run/docs#defillama
 * Twitter: @squeezerun
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

/** Canonical Squeeze identity — greppable for reviewers. */
const IDENTITY = {
  /** Platform fee beneficiary + Doppler Airlock integrator (Base + Robinhood). */
  evmFeeWallet: "0x6C61feE73584670AbEd65101946734006DAB12d6",
  /** Base Airlock — fee-collect sender + create-path integrator filter. */
  baseAirlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
  /** Robinhood Airlock — same role on chain 4663. */
  robinhoodAirlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
  /** Raydium LaunchLab platformId for Squeeze-tagged pools. */
  solanaPlatformId: "FpKUW9vDSRPTByNu4MerR2SU4YPkJU9pLWQTnChGAW3h",
  /** LaunchLab claim / platform-admin wallet (platform fee destination). */
  solanaClaimWallet: "2qUg6a3yCSATL7stUyJHDBgFJwLW8DXzemZQDePxscws",
} as const;

/**
 * Doppler multicurve swap-fee split (percent of 2.5% pool fee).
 * @see https://squeeze.run/docs#terminals
 * @see https://squeeze.run/api/defillama
 */
const PLATFORM_FEE_SHARE = 0.475;
const CREATOR_FEE_SHARE = 0.475;
const DOPPLER_PROTOCOL_SHARE = 0.05;

/** Descriptive breakdown labels (avoid vague METRIC.PROTOCOL_FEES on supply side). */
const LABEL_SQUEEZE_PLATFORM = "Squeeze Platform Fees";
const LABEL_CREATOR = "Creator Fees";
const LABEL_DOPPLER = "Doppler Protocol Fees";

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
  { start: string; kind: "evm" | "solana"; tokens?: string[]; airlock?: string }
> = {
  [CHAIN.BASE]: {
    // Approx. Squeeze Doppler activity window on Base; tighten after first claim-day spot-check.
    // Source: product launch window documented at https://squeeze.run/docs#defillama
    start: "2025-06-01",
    kind: "evm",
    tokens: BASE_FEE_TOKENS,
    airlock: IDENTITY.baseAirlock,
  },
  [CHAIN.ROBINHOOD]: {
    // Robinhood Chain earliest DefiLlama history / RH Doppler go-live window.
    // Source: DefiLlama robinhood chain listing + Squeeze RH Airlock deploy.
    start: "2026-04-20",
    kind: "evm",
    tokens: ROBINHOOD_FEE_TOKENS,
    airlock: IDENTITY.robinhoodAirlock,
  },
  [CHAIN.SOLANA]: {
    // Approx. LaunchLab platform claim window; tighten after first claim-day spot-check.
    // Source: https://squeeze.run/docs#defillama (Solana LaunchLab platformId)
    start: "2025-06-01",
    kind: "solana",
  },
};

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain];
  const dailyRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (cfg.kind === "evm") {
    // Only count numeraire transfers from the chain Airlock → platform wallet.
    // Excludes unrelated deposits and 0x affiliate (25 bps) that also land in
    // the same wallet via Squeeze trade proxies (those must not be grossed up
    // as if they were 47.5% of Doppler pool fees).
    // Note: helper param is historically misspelled `fromAdddesses`.
    const erc20 = await addTokensReceived({
      options,
      target: IDENTITY.evmFeeWallet,
      tokens: cfg.tokens,
      fromAdddesses: cfg.airlock ? [cfg.airlock] : undefined,
    });
    dailyRevenue.addBalances(erc20, LABEL_SQUEEZE_PLATFORM);

    // platform 47.5% → gross = revenue / 0.475
    // creator 47.5% of gross = revenue * (0.475 / 0.475) = revenue
    // Doppler protocol 5% of gross = revenue * (0.05 / 0.475)
    dailyFees.addBalances(
      dailyRevenue.clone(1 / PLATFORM_FEE_SHARE),
      METRIC.TRADING_FEES
    );
    dailySupplySideRevenue.addBalances(
      dailyRevenue.clone(CREATOR_FEE_SHARE / PLATFORM_FEE_SHARE),
      LABEL_CREATOR
    );
    dailySupplySideRevenue.addBalances(
      dailyRevenue.clone(DOPPLER_PROTOCOL_SHARE / PLATFORM_FEE_SHARE),
      LABEL_DOPPLER
    );
  } else {
    // Solana: LaunchLab platform fees claimed to the Squeeze claim wallet.
    // IDENTITY.solanaPlatformId tags Squeeze pools; getSolanaReceived cannot
    // filter by platformId yet, so v1 uses the Squeeze-controlled claim wallet
    // (same wallet-receipt pattern as Clanker). Refine with LaunchLab events
    // or Dune + platformId if maintainers want stricter attribution.
    const sol = options.createBalances();
    await getSolanaReceived({
      options,
      balances: sol,
      target: IDENTITY.solanaClaimWallet,
    });
    dailyRevenue.addBalances(sol, LABEL_SQUEEZE_PLATFORM);
    dailyFees.addBalances(sol, METRIC.TRADING_FEES);
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
    "Gross trading fees on Squeeze launches. On Base/Robinhood, Doppler pools charge 2.5%; Squeeze’s platform wallet receives 47.5% of those fees from the Airlock collect path. Gross fees are extrapolated from those Airlock→wallet receipts. On Solana, LaunchLab platform fees claimed to Squeeze’s claim wallet.",
  Revenue:
    "Squeeze platform share (47.5% of Doppler swap fees on EVM from Airlock; LaunchLab platform fees on Solana) received by Squeeze-controlled wallets.",
  ProtocolRevenue:
    "Same as Revenue — Squeeze treasury / platform wallet.",
  SupplySideRevenue:
    "On EVM: extrapolated creator share (47.5%) and Doppler protocol-owner share (5%). On Solana: not yet attributed in v1.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "User-paid trading fees on Squeeze-launched pools (extrapolated on EVM from 47.5% platform share; Solana = claim-wallet receipts).",
  },
  Revenue: {
    [LABEL_SQUEEZE_PLATFORM]:
      "Tokens received by Squeeze platform / claim wallets (EVM: Airlock→platform wallet numeraires only).",
  },
  ProtocolRevenue: {
    [LABEL_SQUEEZE_PLATFORM]:
      "Squeeze platform cut retained by the treasury / platform wallet.",
  },
  SupplySideRevenue: {
    [LABEL_CREATOR]:
      "Estimated creator share of EVM Doppler pool fees (47.5% of gross).",
    [LABEL_DOPPLER]:
      "Estimated Doppler Airlock protocol-owner share of EVM pool fees (5% of gross).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  // Extrapolated EVM pool fees may overlap Uniswap V4 / Raydium fee dashboards.
  doublecounted: true,
};

export default adapter;
