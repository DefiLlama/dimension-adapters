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
 * - Solana: LaunchLab **platform** fees claimed to the Squeeze claim wallet
 *   (not gross pool fees / not creator+protocol+referral). Pools are tagged with
 *   `solanaPlatformId`; v1 uses the Squeeze-controlled claim wallet (platformId
 *   event/Dune filter can refine later).
 *
 * Do NOT invent TVL from Uniswap V4 / Raydium pool balances.
 *
 * Canonical addresses: https://squeeze.run/api/defillama
 * Docs: https://squeeze.run/docs#defillama
 * Twitter: @squeezerun
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";
import ADDRESSES from '../helpers/coreAssets.json'

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

/** Descriptive breakdown labels (fee-adapter guidelines: source-specific). */
const LABEL_DOPPLER_POOL_FEES = "Doppler Pool Trading Fees";
const LABEL_SQUEEZE_PLATFORM = "Squeeze Platform Fees";
const LABEL_CREATOR = "Creator Fees";
const LABEL_DOPPLER = "Doppler Protocol Fees";
const LABEL_LAUNCHLAB_PLATFORM = "LaunchLab Platform Fees";

const chainConfig: Record<
  string,
  { start: string; kind: "evm" | "solana"; airlock?: string; feeTokens?: string[] }
> = {
  [CHAIN.BASE]: {
    // Approx. Squeeze Doppler activity window on Base; tighten after first claim-day spot-check.
    // Source: product launch window documented at https://squeeze.run/docs#defillama
    start: "2025-06-01",
    kind: "evm",
    airlock: IDENTITY.baseAirlock,
    feeTokens: [ADDRESSES.base.WETH, ADDRESSES.base.USDC]
  },
  [CHAIN.ROBINHOOD]: {
    // Robinhood Chain earliest DefiLlama history / RH Doppler go-live window.
    // Source: DefiLlama robinhood chain listing + Squeeze RH Airlock deploy.
    start: "2026-07-10",
    kind: "evm",
    airlock: IDENTITY.robinhoodAirlock,
    feeTokens: [
      ADDRESSES.robinhood.WETH,
      ADDRESSES.robinhood.USDG,
      "0xF444F3C77C77a33F7c8d8fcab8a1E88aFb843dA5", // SQUEEZE (optional quote)
    ]
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
      tokens: cfg.feeTokens,
      fromAdddesses: cfg.airlock ? [cfg.airlock] : undefined,
    });
    dailyRevenue.addBalances(erc20, LABEL_SQUEEZE_PLATFORM);

    // platform 47.5% → gross = revenue / 0.475
    // creator 47.5% of gross = revenue * (0.475 / 0.475) = revenue
    // Doppler protocol 5% of gross = revenue * (0.05 / 0.475)
    dailyFees.addBalances(
      dailyRevenue.clone(1 / PLATFORM_FEE_SHARE),
      LABEL_DOPPLER_POOL_FEES
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
    // Solana: LaunchLab *platform* fee claims to the Squeeze claim wallet only.
    // Not gross LaunchLab trading fees (creator / Raydium protocol / referral
    // cuts do not land here). IDENTITY.solanaPlatformId tags Squeeze pools;
    // getSolanaReceived cannot filter by platformId yet, so v1 uses the
    // Squeeze-controlled claim wallet. Refine with LaunchLab claim events or
    // Dune + platformId if maintainers want stricter attribution.
    const sol = options.createBalances();
    await getSolanaReceived({
      options,
      balances: sol,
      target: IDENTITY.solanaClaimWallet,
    });
    dailyRevenue.addBalances(sol, LABEL_LAUNCHLAB_PLATFORM);
    // Platform-only: fees == revenue (do not label as gross trading fees).
    dailyFees.addBalances(sol, LABEL_LAUNCHLAB_PLATFORM);
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
    "On Base/Robinhood: gross Doppler pool trading fees (2.5%), extrapolated from Squeeze’s 47.5% Airlock→wallet platform receipts. On Solana: LaunchLab *platform* fees claimed to Squeeze’s claim wallet only (not creator/protocol/referral cuts).",
  Revenue:
    "Squeeze platform share — EVM: 47.5% of Doppler swap fees from Airlock collect; Solana: LaunchLab platform fees to the claim wallet.",
  ProtocolRevenue:
    "Squeeze platform share — EVM: 47.5% of Doppler swap fees from Airlock collect; Solana: LaunchLab platform fees to the claim wallet.",
  SupplySideRevenue:
    "On EVM: extrapolated creator share (47.5%) and Doppler protocol-owner share (5%). On Solana: not attributed in v1 (those cuts never hit the Squeeze claim wallet).",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_DOPPLER_POOL_FEES]:
      "EVM only — user-paid Doppler pool trading fees, extrapolated from 47.5% Airlock→platform receipts.",
    [LABEL_LAUNCHLAB_PLATFORM]:
      "Solana only — LaunchLab platform fee claims to Squeeze’s claim wallet (platform slice, not gross pool fees).",
  },
  Revenue: {
    [LABEL_SQUEEZE_PLATFORM]:
      "EVM — numeraires received by Squeeze platform wallet from Airlock.",
    [LABEL_LAUNCHLAB_PLATFORM]:
      "Solana — LaunchLab platform fees received by Squeeze claim wallet.",
  },
  ProtocolRevenue: {
    [LABEL_SQUEEZE_PLATFORM]:
      "EVM — Squeeze platform cut retained by the treasury / platform wallet.",
    [LABEL_LAUNCHLAB_PLATFORM]:
      "Solana — LaunchLab platform fees retained by Squeeze.",
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
