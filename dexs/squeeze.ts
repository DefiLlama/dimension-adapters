/**
 * DefiLlama DEX volume adapter for Squeeze (https://squeeze.run)
 *
 * Tracks trading volume on Squeeze-identified launches:
 * - EVM (Base + Robinhood): Doppler pools where Airlock `integrator` /
 *   fee beneficiary is the Squeeze platform wallet. Volume is derived from
 *   the same collectFees receipts as `fees/squeeze.ts`:
 *     platformRevenue = Airlock/initializer → wallet (47.5% of 2.5% pool fees)
 *     grossFees       = platformRevenue / 0.475
 *     dailyVolume     = grossFees / 0.025
 * - Solana: Raydium LaunchLab pools tagged with Squeeze `platformId`.
 *   Platform fee receipts to the claim wallet are 1% of trade notional
 *   (PlatformConfig feeRate = 10000 / 1e6 — see LaunchLab docs):
 *     dailyVolume = platformFees / 0.01
 *
 * Same claim-day timing caveat as the fees adapter (fees land when claimed,
 * not when the swap happens). Do NOT invent TVL from AMM pool balances.
 *
 * Canonical addresses: https://squeeze.run/api/defillama
 * Launch counts / platform metrics: https://squeeze.run/api/stats
 * Docs: https://squeeze.run/docs#defillama
 * Twitter: @squeezerun
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

/** Canonical Squeeze identity — greppable for reviewers. */
const IDENTITY = {
  /** Platform fee beneficiary + Doppler Airlock integrator (Base + Robinhood). */
  evmFeeWallet: "0x6C61feE73584670AbEd65101946734006DAB12d6",
  baseAirlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
  robinhoodAirlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
  /** Base UniswapV4MulticurveInitializer — collectFees payout source. */
  baseMulticurveInitializer: "0x65de470da664a5be139a5d812be5fda0d76cc951",
  /**
   * Robinhood DopplerHookInitializer — collectFees payout source on 4663
   * (no UniswapV4MulticurveInitializer on Robinhood).
   */
  robinhoodHookInitializer: "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544",
  solanaPlatformId: "FpKUW9vDSRPTByNu4MerR2SU4YPkJU9pLWQTnChGAW3h",
  solanaClaimWallet: "2qUg6a3yCSATL7stUyJHDBgFJwLW8DXzemZQDePxscws",
} as const;

/**
 * Doppler pool fee = 2.5% of swap notional; Squeeze takes 47.5% of that fee.
 * @see https://squeeze.run/api/defillama
 */
const DOPPLER_POOL_FEE_RATE = 0.025;
const PLATFORM_FEE_SHARE = 0.475;

/**
 * LaunchLab PlatformConfig feeRate = 10000 / 1e6 = 1% of trade notional.
 * @see https://squeeze.run/docs#defillama
 * @see docs/LAUNCHLAB_PLATFORM_SETUP.md (feeRate 10000)
 */
const LAUNCHLAB_PLATFORM_FEE_RATE = 0.01;

const LABEL_DOPPLER_VOLUME = "Doppler Pool Volume";
const LABEL_LAUNCHLAB_VOLUME = "LaunchLab Volume";

type EvmChainConfig = {
  start: string;
  kind: "evm";
  feeSources: string[];
  feeTokens: string[];
};
type SolanaChainConfig = { start: string; kind: "solana" };

const chainConfig: Record<string, EvmChainConfig | SolanaChainConfig> = {
  [CHAIN.BASE]: {
    start: "2025-06-01",
    kind: "evm",
    feeSources: [IDENTITY.baseAirlock, IDENTITY.baseMulticurveInitializer],
    feeTokens: [ADDRESSES.base.WETH, ADDRESSES.base.USDC],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-10",
    kind: "evm",
    feeSources: [IDENTITY.robinhoodAirlock, IDENTITY.robinhoodHookInitializer],
    feeTokens: [
      ADDRESSES.robinhood.WETH,
      ADDRESSES.robinhood.USDG,
      "0xF444F3C77C77a33F7c8d8fcab8a1E88aFb843dA5", // SQUEEZE
    ],
  },
  [CHAIN.SOLANA]: {
    start: "2025-06-01",
    kind: "solana",
  },
};

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  if (cfg.kind === "evm") {
    if (!cfg.feeSources.length || !cfg.feeTokens.length) {
      throw new Error(`squeeze volume: feeSources/feeTokens missing for ${options.chain}`);
    }
    // Same receipts as fees/squeeze.ts → gross fees → volume at 2.5% pool fee.
    const platformRevenue = await addTokensReceived({
      options,
      target: IDENTITY.evmFeeWallet,
      tokens: cfg.feeTokens,
      fromAdddesses: cfg.feeSources,
    });
    // volume = revenue / platformShare / poolFeeRate
    const scale = 1 / (PLATFORM_FEE_SHARE * DOPPLER_POOL_FEE_RATE);
    dailyVolume.addBalances(platformRevenue.clone(scale), LABEL_DOPPLER_VOLUME);
  } else {
    // Solana: platform fee claims ≈ 1% of LaunchLab trade notional.
    const platformFees = options.createBalances();
    await getSolanaReceived({
      options,
      balances: platformFees,
      target: IDENTITY.solanaClaimWallet,
    });
    dailyVolume.addBalances(
      platformFees.clone(1 / LAUNCHLAB_PLATFORM_FEE_RATE),
      LABEL_LAUNCHLAB_VOLUME
    );
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Squeeze-tagged trading volume derived from on-chain platform fee receipts (same sources as fees/squeeze.ts). EVM: Doppler pool volume = platformRevenue / 0.475 / 0.025. Solana: LaunchLab volume = platformFeeClaims / 0.01. Claim-day timing (not swap-day). Overlaps Uniswap V4 / Raydium DEX volume.",
};

const breakdownMethodology = {
  Volume: {
    [LABEL_DOPPLER_VOLUME]:
      "EVM — Doppler pool swap notional on Squeeze integrator launches, extrapolated from 47.5% of 2.5% fee receipts.",
    [LABEL_LAUNCHLAB_VOLUME]:
      "Solana — LaunchLab trade notional on Squeeze platformId pools, extrapolated from 1% platform fee claims.",
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
  // Volume already counted under Uniswap V4 / Raydium on DefiLlama DEX pages.
  doublecounted: true,
};

export default adapter;
