import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Fathom Protocol — Collateralized Debt Position (CDP) on XDC.
// MakerDAO GEB-fork: users lock collateral (XDC, CGO) to mint FXD stablecoin
// and pay a per-second compounding stability fee on the outstanding debt.
//
// Contract registry (from https://docs.fathom.fi/):
//   BookKeeper            0x6FD3f049DF9e1886e1DFc1A034D379efaB0603CE
//   CollateralPoolConfig  0x4F5Ea639600A01931B1370CDe99a7B1e7b6b8f6C
//   StabilityFeeCollector 0x00f093e0E188dA1711a18fd5BF7468aea706888C
const COLLATERAL_POOL_CONFIG = "0x4F5Ea639600A01931B1370CDe99a7B1e7b6b8f6C";

// Collateral pool IDs are bytes32 ASCII tags (mirrors MakerDAO's `ilk`
// pattern). IDs sourced from the existing TVL adapter at
// DefiLlama-Adapters/projects/fathom-CDP/index.js.
const POOLS = [
  { id: "0x5844430000000000000000000000000000000000000000000000000000000000", name: "XDC" }, // ASCII "XDC"
  { id: "0x43474f0000000000000000000000000000000000000000000000000000000000", name: "CGO" }, // ASCII "CGO"
];

const ABI = {
  getTotalDebtShare:      "function getTotalDebtShare(bytes32) view returns (uint256)",
  getDebtAccumulatedRate: "function getDebtAccumulatedRate(bytes32) view returns (uint256)",
  getStabilityFeeRate:    "function getStabilityFeeRate(bytes32) view returns (uint256)",
};

// GEB accounting precisions.
const RAY = 10n ** 27n;            // per-second compounding rate scale
const SCALE_USD_DIVISOR = 10n ** 67n; // see precision note below
const SCALE_USD_REMAINDER = 1e5;

// Per-pool fee math (continuous-rate approximation, matches MakerDAO's
// internal `_drip` formula linearised over a day):
//
//   outstandingDebt_RAD = totalDebtShare(WAD) * debtAccumulatedRate(RAY)
//   feePerSecondRay     = stabilityFeeRate(RAY) - RAY          // small (~6e17 for ~2% APY)
//   fee_RAD             = outstandingDebt_RAD * feePerSecondRay * windowSeconds / RAY
//   fee_USD             = fee_RAD / 1e45                       // FXD is pegged 1:1 USD
//
// We do not depend on `debtAccumulatedRate` changing during the window:
// it only ticks when StabilityFeeCollector.collect() is called, so reading
// the delta gives spurious zeros on most days. The continuous formula uses
// the per-second rate + the snapshot debt, which gives the correctly accrued
// (but not-yet-collected) interest — the same quantity Maker reports as
// "stability fee revenue".
//
// Combining: feeUsd = totalDebtShare * debtAccumulatedRate * (stabilityFeeRate - RAY) * windowSeconds / (RAY * 1e45)
//                   = product / 1e72
// With BigInt: we divide by 10^67 first to keep ~5 decimal places, then by 1e5 in Number.

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const windowSeconds = BigInt(options.endTimestamp - options.startTimestamp);
  if (windowSeconds <= 0n) return { dailyFees, dailyRevenue: dailyFees };

  // All three reads use the latest block at the end of the window. The rates
  // are slow-moving (per-second compounding) so a single snapshot is a
  // reasonable representative for the whole window.
  const calls = POOLS.map((p) => ({ target: COLLATERAL_POOL_CONFIG, params: [p.id] }));
  const [debtShares, accRates, feeRates] = await Promise.all([
    options.toApi.multiCall({ abi: ABI.getTotalDebtShare,      calls, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.getDebtAccumulatedRate, calls, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.getStabilityFeeRate,    calls, permitFailure: true }),
  ]);

  let feeUsd = 0;
  for (let i = 0; i < POOLS.length; i++) {
    if (debtShares[i] == null || accRates[i] == null || feeRates[i] == null) continue;
    const share = BigInt(debtShares[i]);
    const accRate = BigInt(accRates[i]);
    const feeRate = BigInt(feeRates[i]);
    if (share === 0n || feeRate <= RAY) continue; // no debt or no fee configured
    const feePerSecond = feeRate - RAY;
    const product = share * accRate * feePerSecond * windowSeconds;
    // product scale: WAD(1e18) * RAY(1e27) * RAY(1e27) * sec = 1e72 * sec
    // dividing by 1e72 yields USD; we split the division to fit in Number.
    feeUsd += Number(product / SCALE_USD_DIVISOR) / SCALE_USD_REMAINDER;
  }

  if (feeUsd > 0) dailyFees.addUSDValue(feeUsd);

  // 100% of stability-fee income accrues to the Fathom protocol — a CDP has
  // no external supply-side counterparty (debt is minted, not borrowed).
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.XDC],
  start: "2023-09-01",
  methodology: {
    Fees: "Stability fees accrued on Fathom CDP debt positions (XDC and CGO collateral pools), computed from the on-chain outstanding debt and per-second stabilityFeeRate, summed over the window.",
    Revenue: "100% of stability-fee income accrues to the Fathom protocol — there are no external lenders in a CDP.",
  },
};

export default adapter;
