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

// GEB / MakerDAO fixed-point scales.
const RAY = 10n ** 27n;
const RAD_TO_USD_DROP = 10n ** 40n; // drop 40 decimals first so the remainder fits in Number
const USD_REMAINDER = 1e5;

// Exact port of MakerDAO/Fathom CommonMath.rpow — computes x^n in `base`
// precision via binary exponentiation. Matches the Solidity reference at
// fathom-stablecoin-smart-contracts/contracts/main/utils/CommonMath.sol
// bit-for-bit, so applying it to `stabilityFeeRate` reproduces the same
// debtAccumulatedRate the contract would compute after a `collect()` call.
function rpow(x: bigint, n: bigint, base: bigint): bigint {
  if (n === 0n) return base;
  if (x === 0n) return 0n;
  let z = n % 2n === 1n ? x : base;
  const half = base / 2n;
  let nn = n / 2n;
  while (nn > 0n) {
    x = (x * x + half) / base;
    if (nn % 2n === 1n) z = (z * x + half) / base;
    nn = nn / 2n;
  }
  return z;
}

// Per-pool fee math — exactly what StabilityFeeCollector._collect() does:
//
//   growth      = rpow(stabilityFeeRate, windowSeconds, RAY)              [ray]
//   newRate     = growth * accRate / RAY                                  [ray]
//   ΔrateRay    = newRate - accRate                                       [ray]
//   fee_RAD     = totalDebtShare * ΔrateRay                               [rad]
//   fee_USD     = fee_RAD / 1e45                                          (FXD pegged 1:1 USD)
//
// We snapshot at toBlock (single read) — the rate grows deterministically
// per-second, so the canonical formula gives the correctly-accruing
// (but possibly not-yet-collected) interest for the window. This is the
// same accounting Fathom itself applies whenever someone calls collect().
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const windowSeconds = BigInt(options.endTimestamp - options.startTimestamp);
  if (windowSeconds <= 0n) return { dailyFees, dailyRevenue };

  const calls = POOLS.map((p) => ({ target: COLLATERAL_POOL_CONFIG, params: [p.id] }));
  const [debtShares, accRates, feeRates] = await Promise.all([
    options.toApi.multiCall({ abi: ABI.getTotalDebtShare,      calls, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.getDebtAccumulatedRate, calls, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.getStabilityFeeRate,    calls, permitFailure: true }),
  ]);

  for (let i = 0; i < POOLS.length; i++) {
    if (debtShares[i] == null || accRates[i] == null || feeRates[i] == null) continue;
    const share = BigInt(debtShares[i]);
    const accRate = BigInt(accRates[i]);
    const feeRate = BigInt(feeRates[i]);
    if (share === 0n || feeRate <= RAY) continue; // no debt or no stability fee configured

    const growth = rpow(feeRate, windowSeconds, RAY);
    const deltaRate = (growth * accRate) / RAY - accRate; // [ray]
    if (deltaRate <= 0n) continue;
    const feeRad = share * deltaRate; // [rad]
    const usd = Number(feeRad / RAD_TO_USD_DROP) / USD_REMAINDER;
    if (usd <= 0) continue;

    dailyFees.addUSDValue(usd, `${POOLS[i].name} Stability Fees`);
    // 100% of stability-fee income accrues to the Fathom protocol — a CDP has
    // no external supply-side counterparty (debt is minted, not borrowed).
    dailyRevenue.addUSDValue(usd, `${POOLS[i].name} Stability Fees To Treasury`);
  }

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.XDC],
  start: "2023-09-01",
  methodology: {
    Fees: "Stability fees accrued on Fathom CDP debt positions (XDC and CGO collateral pools). Reproduces StabilityFeeCollector._collect()'s exact rpow-based math against the on-chain stabilityFeeRate, debtAccumulatedRate, and totalDebtShare snapshots.",
    Revenue: "100% of stability-fee income accrues to the Fathom protocol — there are no external lenders in a CDP.",
  },
  breakdownMethodology: {
    Fees: {
      "XDC Stability Fees": "Per-second stability-fee accrual on outstanding FXD debt backed by XDC collateral.",
      "CGO Stability Fees": "Per-second stability-fee accrual on outstanding FXD debt backed by CGO collateral.",
    },
    Revenue: {
      "XDC Stability Fees To Treasury": "Stability-fee revenue from the XDC pool — 100% retained by the Fathom protocol.",
      "CGO Stability Fees To Treasury": "Stability-fee revenue from the CGO pool — 100% retained by the Fathom protocol.",
    },
  },
};

export default adapter;
