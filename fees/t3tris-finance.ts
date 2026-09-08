import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";

/**
 * T3tris Finance — Fees & Revenue Adapter
 *
 * Revenue model:
 *   1. **Vault fees** (→ feeRecipient per vault, i.e. vault manager):
 *      - Performance fees: % of profit above high-water mark (share dilution)
 *      - Management fees:  annual % of TVL, prorated (share dilution)
 *      - Entry fees:       bps on deposits (from DepositsSettled events)
 *      - Exit fees:        bps on withdrawals (from RedemptionsSettled events)
 *
 *   2. **T3trisProfit** (→ t3treasury, i.e. protocol revenue):
 *      The T3trisProfit(uint256 profit) event is emitted every time the vault
 *      transfers assets to the t3treasury address. This is the ONLY event that
 *      tracks protocol revenue — it captures the exact amount sent to treasury,
 *      regardless of origin (silo yield, pending fees, etc.).
 *      We do NOT index silo contracts or silo PNL events directly.
 *
 * DefiLlama mapping:
 *   - dailyFees              = gross yield (depositor yield + curator perf/mgmt
 *                              fees) + entry/exit fees + T3trisProfit
 *   - dailySupplySideRevenue = net depositor yield + curator performance,
 *                              management, entry and exit fees
 *   - dailyRevenue           = T3trisProfit only (assets sent to t3treasury)
 *   - dailyProtocolRevenue   = T3trisProfit only (= dailyRevenue)
 *
 *   Vault fees (perf/mgmt/entry/exit) go to each vault's feeRecipient — a
 *   third-party curator, NOT the t3tris protocol. They are counted in dailyFees
 *   and dailySupplySideRevenue, but NOT in dailyRevenue/dailyProtocolRevenue.
 *
 * Vaults are sourced from the T3tris ecosystem API
 * (https://ecosystem.t3tris.finance/vaults), keeping only `verified` and
 * non-`blacklisted` vaults — the same curation gate as the TVL adapter, so
 * fees/revenue cover exactly the same vault set as TVL. Unverified/test vaults
 * (which can carry non-production TVL and fee config on mainnet) are excluded.
 *
 * Landing: https://t3tris.finance/   App: https://app.t3tris.finance/
 */

// T3tris ecosystem API — authoritative list of vaults with curation flags.
// Only `verified`, non-`blacklisted` vaults are counted (same gate as the TVL
// adapter), so fees & TVL cover the same set and unverified/test vaults are
// excluded.
const VAULTS_API = "https://ecosystem.t3tris.finance/vaults";

const ABI = {
  asset: "address:asset",
  decimals: "uint8:decimals",
  totalAssets: "uint256:totalAssets",
  totalSupply: "uint256:totalSupply",
  convertToAssets: "function convertToAssets(uint256) view returns (uint256)",
  getPerformanceFee:
    "function getPerformanceFee() external view returns (uint64)",
  getManagementFee:
    "function getManagementFee() external view returns (uint64 managementFeeWad, uint32 managementFeeDays)",
  // High-water mark (WAD-scaled PPS): performance fees only accrue on gains
  // above it, so it gates the perf-fee basis below.
  getPpsHighWaterMark: "function getPpsHighWaterMark() view returns (uint128)",
};

const EVENT_ABI = {
  depositsSettled:
    "event DepositsSettled(uint256 indexed requestId, uint256 assetsDeposited, uint256 sharesMinted, uint256 entryFees, uint256 unclaimedFees)",
  redemptionsSettled:
    "event RedemptionsSettled(uint256 indexed requestId, uint256 sharesToRedeem, uint256 assetsWithdrawn, uint256 sharesBurned, uint256 exitFeeAssets, uint256 unclaimedSharesFee, uint256 feeRecipientAmount)",
  // Assets transferred to t3treasury — the ONLY event tracking protocol revenue
  t3trisProfit: "event T3trisProfit(uint256 profit)",
};

const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2026-06-14" },
  // Robinhood Chain: chainId 4663 per chainlist.org & @defillama/sdk
  // providers.json ("robinhoodchain"); start = T3tris deployment date on Robinhood.
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-13" },
};

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

// Settlement-cycle detection thresholds. A settlement mints shares for pending
// depositors, causing totalSupply to jump while oracle.totalAssets() is stale.
// Supply growth above this ratio (1.1 = +10%) in a single slot signals a
// settlement occurred; PPS readings in that slot are unreliable.
const SETTLEMENT_SUPPLY_GROWTH_RATIO = 1.1;
// If supply grew AND PPS jumped by more than this fraction (0.1 = 10%) in the
// same slot, it's the recovery after a settlement drop (not real yield).
const SETTLEMENT_PPS_JUMP_RATIO = 0.1;
// Max plausible annualised price-per-share growth for a single slot, as a
// fraction (10 = 1000%). Matches the APY adapter's cap. A stale/glitched
// convertToAssets read at a slot boundary (too-low start or too-high end PPS)
// can imply an absurd jump and inject a phantom yield that dominates once a
// single vault is the only one reporting; readings above this bound are treated
// as unreliable and contribute no yield. Real yield — even a lumpy oracle update
// concentrating a day into one slot — stays well under it.
const MAX_PLAUSIBLE_GROWTH_APY = 10;

// Resilient wrapper around `api.multiCall`. Even with `permitFailure: true`,
// @defillama/sdk can still THROW "Cannot read properties of undefined (reading
// 'success')": when a whole multicall *chunk* fails at the RPC level the SDK
// stores `undefined` for that chunk and then dereferences it in
// `flatResults.filter(r => !r.success)`, which aborts the entire hourly slice
// (and, since this adapter is pullHourly, the whole day). Every caller below
// already treats a missing entry as "skip this vault", so retry a transient
// failure and, only if it keeps failing, degrade to an all-null array (the same
// shape `permitFailure` yields on success) instead of crashing the run. A
// SUSTAINED outage of the vault-gating reads (asset/totalSupply/price-per-share)
// is caught by an explicit all-null guard after the reads, which fails loudly
// rather than letting every vault be skipped and reporting a phantom 0 fees.
async function safeMultiCall(
  api: FetchOptions["api"],
  params: { abi: any; calls: any[] },
): Promise<any[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await api.multiCall({ ...params, permitFailure: true });
    } catch (e) {
      if (attempt === 3) {
        console.error(
          `T3tris: multiCall(${params.abi}) failed after ${attempt} attempts ` +
            `(${(e as Error)?.message}) — treating its ${params.calls.length} ` +
            `results as unavailable for this slice`,
        );
        return new Array(params.calls.length).fill(null);
      }
    }
  }
  return new Array(params.calls.length).fill(null);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // 1. Discover vaults for this chain from the T3tris ecosystem API, keeping
  //    only `verified`, non-`blacklisted` entries (same curation gate as the
  //    TVL adapter). Unverified/test vaults are intentionally excluded so fees
  //    & revenue reflect the same vault set as TVL. Records are external data,
  //    so a usable address + asset is required before trusting them on-chain.
  let vaults: string[];
  const chainId = chainConfig[options.chain].chainId;
  const all = await getConfig("t3tris/vaults", VAULTS_API);
  // A failed/empty API response is a real error worth surfacing loudly.
  if (!Array.isArray(all) || all.length === 0) {
    throw new Error(`T3tris: vaults API returned no data`);
  }
  // Guard against a malformed/partial payload (e.g. `[null]`, `[{}]`) that would
  // otherwise filter down to zero and masquerade as a legitimate "no verified
  // vaults" day: require at least one structurally valid vault record (address +
  // asset) before trusting the filtered result.
  const isVaultRecord = (v: any) =>
    v &&
    typeof v.address === "string" &&
    v.address &&
    typeof v.asset === "string" &&
    v.asset;
  if (!all.some(isVaultRecord)) {
    throw new Error(`T3tris: vaults API returned no valid vault records`);
  }
  vaults = all
    .filter(
      (v: any) =>
        v?.verified &&
        !v?.blacklisted &&
        Number(v?.chainId) === chainId &&
        typeof v?.address === "string" &&
        v.address &&
        typeof v?.asset === "string" &&
        v.asset,
    )
    .map((v: any) => v.address);

  // Valid payload, but no verified vault for this chain yet (e.g. a freshly-added
  // chain before its first vault is live): a legitimate zero-fee day, not an error.
  if (vaults.length === 0) {
    return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue };
  }

  // 2. Fetch vault metadata
  const assets = await safeMultiCall(options.api, {
    abi: ABI.asset,
    calls: vaults,
  });
  const decimals = await safeMultiCall(options.api, {
    abi: ABI.decimals,
    calls: vaults,
  });
  const totalSupplies = await safeMultiCall(options.api, {
    abi: ABI.totalSupply,
    calls: vaults,
  });
  const totalAssets = await safeMultiCall(options.api, {
    abi: ABI.totalAssets,
    calls: vaults,
  });

  // Asset-token decimals. A vault's own decimals() reports its SHARE scale,
  // which can differ from the asset's — needed below to place the WAD
  // high-water mark on the same scale as convertToAssets for the perf fee.
  const assetDecimals = await safeMultiCall(options.api, {
    abi: ABI.decimals,
    calls: assets.map((asset: string, i: number) => asset || vaults[i]),
  });

  // Robust share-scale detection. Some vaults mint shares at a different scale
  // than their reported decimals() (e.g. 1e18-scaled shares while decimals()
  // returns the asset's 6 decimals). Using 10**decimals() as the per-share unit
  // then makes convertToAssets(unit) round down to 0, and the vault would be
  // silently dropped — missing ALL of its fees. Probe convertToAssets at a large
  // fixed unit and infer the whole-share exponent from the (linear)
  // assets-per-raw-share, assuming a whole share is worth on the order of one
  // asset unit (vaults launch at ~1:1 price-per-share).
  const SCALE_PROBE = (10n ** 27n).toString();
  const scaleProbe = await safeMultiCall(options.api, {
    abi: ABI.convertToAssets,
    calls: vaults.map((vault: string) => ({
      target: vault,
      params: [SCALE_PROBE],
    })),
  });
  const shareDecimals = scaleProbe.map((probeVal: any, i: number) => {
    const assetDec = Number(assetDecimals[i] ?? decimals[i] ?? 6);
    const fallback = Number(decimals[i] ?? 18);
    const probe = probeVal != null ? Number(probeVal) : 0;
    if (probe > 0) {
      const ppsRaw = probe / 1e27; // assets(raw) per share(raw)
      const inferred = Math.round(assetDec - Math.log10(ppsRaw));
      if (Number.isFinite(inferred) && inferred >= 0 && inferred <= 36)
        return inferred;
    }
    return fallback;
  });

  // 3. Build rate conversion calls (1 full share → assets), using the detected
  //    share scale. BigInt keeps the uint256 param a plain integer string
  //    (Number/** would stringify high scales as "1e+21", which the call cannot
  //    parse).
  const convertCalls = vaults.map((vault: string, index: number) => ({
    target: vault,
    params: [(10n ** BigInt(shareDecimals[index])).toString()],
  }));

  // 4. Get share price at start and end of period
  const ratesBefore = await safeMultiCall(options.fromApi, {
    abi: ABI.convertToAssets,
    calls: convertCalls,
  });
  const ratesAfter = await safeMultiCall(options.toApi, {
    abi: ABI.convertToAssets,
    calls: convertCalls,
  });

  // Distinguish a sustained RPC outage from a genuine zero-fee day. The reads
  // that gate every vault below (asset, totalSupply, and price-per-share at both
  // period bounds) drive the `!token || !supply || !rateBefore || !rateAfter`
  // skip. If safeMultiCall exhausted its retries and degraded one of these to an
  // all-null batch, EVERY vault would be skipped and the slice would silently
  // record 0 fees — indistinguishable from a real zero day. Fail loudly instead
  // so the outage is visible rather than mistaken for data. (A real zero-fee day
  // still has populated, non-null reads, so this never trips on legitimate data.)
  const allUnavailable = (arr: any[]) =>
    arr.length > 0 && arr.every((v) => v == null);
  if (
    allUnavailable(assets) ||
    allUnavailable(totalSupplies) ||
    allUnavailable(ratesBefore) ||
    allUnavailable(ratesAfter)
  ) {
    throw new Error(
      `T3tris: core vault metadata unavailable on ${options.chain} this slice ` +
        `(sustained RPC failure after retries) — refusing to report 0 fees`,
    );
  }

  // 4b. Start-of-period supply & TVL (the end-of-period values are already in
  //     totalSupplies/totalAssets). Averaging the start and end snapshots gives
  //     a time-weighted (trapezoidal) estimate over the window, so intra-period
  //     deposits/redeems don't skew the 24h depositor yield or management fees.
  const suppliesBefore = await safeMultiCall(options.fromApi, {
    abi: ABI.totalSupply,
    calls: vaults,
  });
  const tvlBefore = await safeMultiCall(options.fromApi, {
    abi: ABI.totalAssets,
    calls: vaults,
  });

  // 5. Get fee configuration + high-water mark for each vault
  const perfFees = await safeMultiCall(options.api, {
    abi: ABI.getPerformanceFee,
    calls: vaults,
  });
  const mgmtFees = await safeMultiCall(options.api, {
    abi: ABI.getManagementFee,
    calls: vaults,
  });
  const hwms = await safeMultiCall(options.api, {
    abi: ABI.getPpsHighWaterMark,
    calls: vaults,
  });

  // 6. Calculate daily yield and fee splits
  //    Vault fees (perf/mgmt) → feeRecipient (vault manager)
  //    Net yield → depositors (supply side)
  const timespan = options.endTimestamp - options.startTimestamp;

  for (let i = 0; i < vaults.length; i++) {
    const token = assets[i];
    const decimal = shareDecimals[i];
    const supply = totalSupplies[i];
    const tvl = totalAssets[i];
    const rateBefore = ratesBefore[i];
    const rateAfter = ratesAfter[i];

    // Required reads for the yield computation. A vault missing any of these
    // (e.g. a failed multicall) is skipped — log it with the vault address and
    // the missing fields so the gap is visible rather than silently swallowed.
    if (!token || !supply || !rateBefore || !rateAfter) {
      const missing = [
        !token && "asset",
        !supply && "totalSupply",
        !rateBefore && "pricePerShare(start)",
        !rateAfter && "pricePerShare(end)",
      ]
        .filter(Boolean)
        .join(", ");
      console.error(
        `T3tris: skipping vault ${vaults[i]} on ${options.chain} — missing ${missing}`,
      );
      continue;
    }

    const unit = 10 ** decimal;
    const assetDec = Number(assetDecimals[i] ?? 6);
    const assetUnit = 10 ** assetDec;
    const rateGrowth = Number(rateAfter) - Number(rateBefore);

    // Settlement-cycle guard: T3tris vaults have an async settlement where
    // totalSupply increases (shares minted for depositors) BEFORE the oracle
    // updates totalAssets. This makes convertToAssets drop artificially (e.g.
    // 1.004 → 0.514). When we detect a settlement artifact, zero out the
    // PPS-derived yield (netYield/perfYield) but still let management fees
    // accrue (they are TVL × time, independent of PPS).
    const supplyStart = suppliesBefore[i];
    const supplyGrew =
      supplyStart != null && Number(supplyStart) > 0
        ? Number(supply) / Number(supplyStart) > SETTLEMENT_SUPPLY_GROWTH_RATIO
        : false;
    const isSettlementDrop = supplyGrew && rateGrowth < 0;
    const isSettlementRecovery =
      supplyGrew &&
      rateGrowth > 0 &&
      Number(rateBefore) > 0 &&
      rateGrowth / Number(rateBefore) > SETTLEMENT_PPS_JUMP_RATIO;
    const settlementArtifact = isSettlementDrop || isSettlementRecovery;
    if (settlementArtifact) {
      console.error(
        `T3tris: settlement artifact for vault ${vaults[i]} on ${options.chain} ` +
          `(supplyGrowth=${(Number(supply) / Number(supplyStart!)).toFixed(2)}x, ` +
          `rateGrowth=${rateGrowth > 0 ? "+" : ""}${((rateGrowth / Number(rateBefore)) * 100).toFixed(1)}%) ` +
          `— zeroing PPS-derived yield, management fees still accrue`,
      );
    }

    // Time-weighted (trapezoidal) supply & TVL: average the start and end
    // snapshots instead of using the end-only value, so the 24h fees are far
    // less sensitive to intra-period deposits/redeems. Fall back to the end
    // snapshot when the start read is unavailable (e.g. a failed multicall).
    const avgSupply =
      supplyStart != null
        ? (Number(supplyStart) + Number(supply)) / 2
        : Number(supply);
    const tvlStart = tvlBefore[i];
    const avgTvl =
      tvlStart != null ? (Number(tvlStart) + Number(tvl)) / 2 : Number(tvl);

    // Net yield to shareholders = avgSupply × delta(PPS) / unit
    // PPS already has perf/mgmt fees deducted (they dilute PPS via share minting)
    //
    // Guard against spurious PPS readings first: a stale/glitched convertToAssets
    // value at a slot boundary (too-low start or too-high end PPS) implies an
    // absurd per-slot jump and would inject a phantom yield — which dominates the
    // daily total once a single vault is the only one reporting. Require a
    // positive baseline PPS and bound the implied annualised growth; otherwise
    // book no PPS-derived yield for this slot (management fee, based on TVL ×
    // time, is independent of PPS and still accrues below).
    const ppsGrowthFrac =
      Number(rateBefore) > 0 ? rateGrowth / Number(rateBefore) : Infinity;
    const impliedApy =
      timespan > 0 ? ppsGrowthFrac * (SECONDS_PER_YEAR / timespan) : Infinity;
    const ppsReliable =
      !settlementArtifact &&
      Number(rateBefore) > 0 &&
      impliedApy <= MAX_PLAUSIBLE_GROWTH_APY;
    if (!ppsReliable && rateGrowth > 0 && !settlementArtifact) {
      console.error(
        `T3tris: ignoring implausible PPS growth for vault ${vaults[i]} on ${options.chain} ` +
          `(start=${rateBefore}, end=${rateAfter}, ~${(impliedApy * 100).toFixed(0)}% APY) — booking no yield this slot`,
      );
    }

    const netYield = ppsReliable ? (avgSupply * rateGrowth) / unit : 0;

    // Performance fees are only charged on price-per-share gains ABOVE the
    // vault's high-water mark (HWM). Inferring them from any positive PPS
    // growth overcounts while the vault is still below its HWM (PPS rose but
    // hasn't recovered past its prior peak, so no fee is actually taken). Use
    // only the growth above max(startPPS, HWM) as the fee basis. HWM is
    // WAD-scaled price-per-WHOLE-share; convert it to the same raw-asset scale
    // as convertToAssets by multiplying by the ASSET unit (not the share unit,
    // which may differ from the asset's decimals). Missing HWM → fall back to 0
    // (no gate), keeping the prior behaviour for any vault without the getter.
    const hwmRate = hwms[i] != null ? (Number(hwms[i]) / 1e18) * assetUnit : 0;
    const perfBasisStart = Math.max(Number(rateBefore), hwmRate);
    const perfRateGrowth = Number(rateAfter) - perfBasisStart;
    const perfYield =
      ppsReliable && perfRateGrowth > 0
        ? (avgSupply * perfRateGrowth) / unit
        : 0;

    // Performance fee (WAD, 1e18 = 100%): perfFeeAmount = perfYield × f / (1 - f)
    const perfFeeFrac = perfFees[i] ? Number(perfFees[i]) / 1e18 : 0;
    const performanceFees =
      perfYield > 0 && perfFeeFrac > 0
        ? (perfYield * perfFeeFrac) / (1 - perfFeeFrac)
        : 0;

    // Management fee (WAD, 1e18 = 100%): avgTVL × f × (timespan / (mgmtDays × 86400))
    // Charged on TVL over time, so it accrues even on flat or negative periods.
    let managementFees = 0;
    if (mgmtFees[i] && avgTvl) {
      const mgmtFeeFrac = Number(mgmtFees[i].managementFeeWad || 0) / 1e18;
      const mgmtFeeDays = Number(mgmtFees[i].managementFeeDays || 365);
      if (mgmtFeeFrac > 0 && mgmtFeeDays > 0) {
        managementFees =
          (avgTvl * mgmtFeeFrac * timespan) / (mgmtFeeDays * SECONDS_PER_DAY);
      }
    }

    // Gross vault yield = everything the strategies produced this period
    // (depositor yield + curator performance/management fees). It is split
    // below between depositors and the vault curator, both supply-side.
    dailyFees.add(
      token,
      netYield + performanceFees + managementFees,
      "Vault Yield",
    );

    // Supply side = net yield to depositors + curator fees. The curator is a
    // third-party vault manager (NOT the t3tris protocol), so its performance
    // and management fees are a supply-side cost, not protocol revenue.
    dailySupplySideRevenue.add(token, netYield, "Depositor Yield");
    dailySupplySideRevenue.add(
      token,
      performanceFees,
      "Curator Performance Fees",
    );
    dailySupplySideRevenue.add(
      token,
      managementFees,
      "Curator Management Fees",
    );
  }

  // 7. Track entry fees from DepositsSettled events → feeRecipient.
  //    onlyArgs:false so each log keeps its `address` (to map back to the vault)
  //    alongside the decoded `args`. The default (onlyArgs:true) returns only
  //    the args and drops the address, leaving every event unattributed
  //    (vaultIndex = -1) and silently ignored.
  const depositLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.depositsSettled,
    onlyArgs: false,
    flatten: true,
  });

  for (const log of depositLogs) {
    const entryFeeAssets = Number(log.args.entryFees);
    if (entryFeeAssets > 0) {
      const vaultAddr = (log as any).address?.toLowerCase();
      const vaultIndex = vaults.findIndex(
        (v: string) => v.toLowerCase() === vaultAddr,
      );
      const token = vaultIndex >= 0 ? assets[vaultIndex] : null;
      if (token) {
        dailyFees.add(token, entryFeeAssets, "Entry Fees");
        // Entry fees go to the vault curator (feeRecipient), a third party → supply side
        dailySupplySideRevenue.add(token, entryFeeAssets, "Curator Entry Fees");
      }
    }
  }

  // 8. Track exit fees from RedemptionsSettled events → feeRecipient.
  //    onlyArgs:false to keep each log's `address` for vault attribution.
  const redeemLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.redemptionsSettled,
    onlyArgs: false,
    flatten: true,
  });

  for (const log of redeemLogs) {
    const exitFeeAssets = Number(log.args.exitFeeAssets);
    if (exitFeeAssets > 0) {
      const vaultAddr = (log as any).address?.toLowerCase();
      const vaultIndex = vaults.findIndex(
        (v: string) => v.toLowerCase() === vaultAddr,
      );
      const token = vaultIndex >= 0 ? assets[vaultIndex] : null;
      if (token) {
        dailyFees.add(token, exitFeeAssets, "Exit Fees");
        // Exit fees go to the vault curator (feeRecipient), a third party → supply side
        dailySupplySideRevenue.add(token, exitFeeAssets, "Curator Exit Fees");
      }
    }
  }

  // 9. Track T3trisProfit events — assets actually transferred to t3treasury
  //    This is the sole source of protocol revenue. We do NOT index silo
  //    contracts or silo PNL events directly; T3trisProfit captures the exact
  //    amount sent to the treasury regardless of origin.
  //    onlyArgs:false to keep each log's `address` for vault attribution.
  const profitLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.t3trisProfit,
    onlyArgs: false,
    flatten: true,
  });

  for (const log of profitLogs) {
    const profit = Number(log.args.profit);
    if (profit > 0) {
      const vaultAddr = (log as any).address?.toLowerCase();
      const vaultIndex = vaults.findIndex(
        (v: string) => v.toLowerCase() === vaultAddr,
      );
      const token = vaultIndex >= 0 ? assets[vaultIndex] : null;
      if (token) {
        dailyFees.add(token, profit, "T3tris Treasury Profit");
        dailyRevenue.add(token, profit, "T3tris Treasury Profit");
        dailyProtocolRevenue.add(token, profit, "T3tris Treasury Profit"); // ONLY T3trisProfit is t3tris revenue
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Total yield generated by vault strategies, including depositor yield, curator fees and T3tris treasury profit.",
  SupplySideRevenue:
    "Value flowing to capital providers and the third-party vault curator: net depositor yield + curator performance, management, entry and exit fees. The curator is not t3tris.",
  Revenue:
    "Earnings sent to the T3tris treasury. Third-party services are also T3tris revenue but are not observable on-chain.",
  ProtocolRevenue:
    "Earnings sent to the T3tris treasury. Third-party services are also T3tris revenue but are not observable on-chain.",
};

const breakdownMethodology = {
  Fees: {
    "Vault Yield":
      "Gross yield from vault strategies (depositor yield plus curator performance and management fees).",
    "Entry Fees": "Fees charged on deposits, collected by the vault curator.",
    "Exit Fees": "Fees charged on withdrawals, collected by the vault curator.",
    "T3tris Treasury Profit":
      "Assets transferred to the t3treasury (T3trisProfit events).",
  },
  SupplySideRevenue: {
    "Depositor Yield":
      "Net yield earned by vault depositors after all fees are deducted.",
    "Curator Performance Fees":
      "Performance fees paid to the third-party vault curator (feeRecipient).",
    "Curator Management Fees":
      "Management fees paid to the third-party vault curator (feeRecipient).",
    "Curator Entry Fees":
      "Entry fees paid to the third-party vault curator (feeRecipient).",
    "Curator Exit Fees":
      "Exit fees paid to the third-party vault curator (feeRecipient).",
  },
  Revenue: {
    "T3tris Treasury Profit":
      "Assets transferred to the t3treasury (T3trisProfit events).",
  },
  ProtocolRevenue: {
    "T3tris Treasury Profit":
      "Assets transferred to the t3treasury (T3trisProfit events).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // ERC 4626 vault prices can go down
};

export default adapter;
