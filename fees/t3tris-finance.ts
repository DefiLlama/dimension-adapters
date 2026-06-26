import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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
 * Vaults are discovered fully on-chain from the T3tris protocol contract (the
 * vault factory/registry, deployed at a deterministic CREATE3 address that is
 * identical on every EVM chain). Every vault ever deployed is enumerated via
 * getDeployedVaultsCount() + getDeployedVaults(fromIndex, toIndex); there is no
 * off-chain dependency and no curation filter — fees/revenue are tracked for
 * every vault. (The `verified`/`blacklisted` flags exposed by the t3tris UI are
 * a purely off-chain curation concern; on-chain every vault moves real assets
 * and the t3treasury still receives its T3trisProfit transfers, so all vaults
 * must be counted to report fees & revenue accurately.)
 *
 * Landing: https://t3tris.finance/   App: https://app.t3tris.finance/
 */

// T3tris protocol contract (vault factory/registry). Deterministic CREATE3
// proxy address — identical on every EVM chain T3tris is deployed to.
// Verify (Arbitrum): https://arbiscan.io/address/0x0000000000CC53b5Fd649b80f08b05405779cC71
// Deployment record: t3tris-finance/T3tris-Vault → T3TRIS_PROTOCOL_V1 in
// script/deployment/production/Utils/Constants.sol.
const T3TRIS = "0x0000000000CC53b5Fd649b80f08b05405779cC71";

const ABI = {
  // Factory/registry: enumerate every deployed vault on-chain.
  getDeployedVaultsCount: "uint256:getDeployedVaultsCount",
  getDeployedVaults:
    "function getDeployedVaults(uint256 fromIndex, uint256 toIndex) view returns (address[])",
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

// Supported chains: DefiLlama chain -> { start }. T3tris is live on Arbitrum
// only for now (same deterministic CREATE3 address on every EVM chain); add a
// chain here once the protocol contract is deployed and enumerates vaults on it.
// `start` is a conservative lower bound that predates the first vault
// deployment (no vaults/events exist before it); verify against the contract's
// creation tx on Arbiscan (link above) if a tighter bound is needed.
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ARBITRUM]: { start: "2025-01-01" },
};

const SECONDS_PER_DAY = 86400;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // 1. Discover all vaults for this chain on-chain from the T3tris protocol
  //    contract (vault factory/registry). Every vault ever deployed is
  //    enumerated via getDeployedVaultsCount() + getDeployedVaults(from, to);
  //    no off-chain dependency and no curation filter — fees/revenue are
  //    tracked for every vault regardless of UI verified/blacklisted status.
  let vaults: string[];
  try {
    const count = Number(
      await options.api.call({
        target: T3TRIS,
        abi: ABI.getDeployedVaultsCount,
      }),
    );
    if (!count) return {};

    // getDeployedVaults(fromIndex, toIndex) is inclusive on both ends; page it
    // to stay within multicall/return-size limits for large registries.
    const PAGE = 200;
    const pageCalls: { target: string; params: [number, number] }[] = [];
    for (let from = 0; from < count; from += PAGE) {
      pageCalls.push({
        target: T3TRIS,
        params: [from, Math.min(from + PAGE - 1, count - 1)],
      });
    }
    // Fail loudly on any failed page: permitFailure defaults to false, so a
    // missing page throws into the catch below rather than silently producing
    // a partial vault list (which would under-report fees/revenue).
    const pages = await options.api.multiCall({
      abi: ABI.getDeployedVaults,
      calls: pageCalls,
    });
    vaults = pages.flat();
  } catch (e) {
    // Protocol not deployed on this chain, or a registry page failed to read —
    // report nothing for this run rather than continuing with incomplete vault
    // discovery, so other chains continue.
    console.error(`T3tris: failed to enumerate vaults for ${options.chain}:`, e);
    return {};
  }

  if (!vaults || vaults.length === 0) return {};

  // 2. Fetch vault metadata
  const [assets, decimals, totalSupplies, totalAssets] = await Promise.all([
    options.api.multiCall({
      abi: ABI.asset,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.decimals,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.totalSupply,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.totalAssets,
      calls: vaults,
      permitFailure: true,
    }),
  ]);

  // 3. Build rate conversion calls (1 full share → assets)
  //    Build the unit with BigInt so the uint256 param is always a plain
  //    integer string. Number/** stringifies to exponential form (e.g.
  //    "1e+21") for high-decimal vaults, which convertToAssets cannot parse.
  const convertCalls = vaults.map((vault: string, index: number) => ({
    target: vault,
    params: [(10n ** BigInt(Number(decimals[index] || 18))).toString()],
  }));

  // 4. Get share price at start and end of period
  const [ratesBefore, ratesAfter] = await Promise.all([
    options.fromApi.multiCall({
      abi: ABI.convertToAssets,
      calls: convertCalls,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: ABI.convertToAssets,
      calls: convertCalls,
      permitFailure: true,
    }),
  ]);

  // 4b. Start-of-period supply & TVL (the end-of-period values are already in
  //     totalSupplies/totalAssets). Averaging the start and end snapshots gives
  //     a time-weighted (trapezoidal) estimate over the window, so intra-period
  //     deposits/redeems don't skew the 24h depositor yield or management fees.
  const [suppliesBefore, tvlBefore] = await Promise.all([
    options.fromApi.multiCall({
      abi: ABI.totalSupply,
      calls: vaults,
      permitFailure: true,
    }),
    options.fromApi.multiCall({
      abi: ABI.totalAssets,
      calls: vaults,
      permitFailure: true,
    }),
  ]);

  // 5. Get fee configuration + high-water mark for each vault
  const [perfFees, mgmtFees, hwms] = await Promise.all([
    options.api.multiCall({
      abi: ABI.getPerformanceFee,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.getManagementFee,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.getPpsHighWaterMark,
      calls: vaults,
      permitFailure: true,
    }),
  ]);

  // 6. Calculate daily yield and fee splits
  //    Vault fees (perf/mgmt) → feeRecipient (vault manager)
  //    Net yield → depositors (supply side)
  const timespan = options.endTimestamp - options.startTimestamp;

  for (let i = 0; i < vaults.length; i++) {
    const token = assets[i];
    const decimal = Number(decimals[i] || 18);
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
    const rateGrowth = Number(rateAfter) - Number(rateBefore);

    // Time-weighted (trapezoidal) supply & TVL: average the start and end
    // snapshots instead of using the end-only value, so the 24h fees are far
    // less sensitive to intra-period deposits/redeems. Fall back to the end
    // snapshot when the start read is unavailable (e.g. a failed multicall).
    const supplyStart = suppliesBefore[i];
    const avgSupply =
      supplyStart != null
        ? (Number(supplyStart) + Number(supply)) / 2
        : Number(supply);
    const tvlStart = tvlBefore[i];
    const avgTvl =
      tvlStart != null ? (Number(tvlStart) + Number(tvl)) / 2 : Number(tvl);

    // Net yield to shareholders = avgSupply × delta(PPS) / unit
    // PPS already has perf/mgmt fees deducted (they dilute PPS via share minting)
    const netYield = (avgSupply * rateGrowth) / unit;

    // Depositor yield and performance fees only accrue on positive yield;
    // management fees are charged on TVL × time and accrue regardless (see
    // below), so we no longer skip the whole vault on a flat/negative period.
    const depositorYield = netYield > 0 ? netYield : 0;

    // Performance fees are only charged on price-per-share gains ABOVE the
    // vault's high-water mark (HWM). Inferring them from any positive PPS
    // growth overcounts while the vault is still below its HWM (PPS rose but
    // hasn't recovered past its prior peak, so no fee is actually taken). Use
    // only the growth above max(startPPS, HWM) as the fee basis. HWM is
    // WAD-scaled PPS; convert to the rate scale (assets per `unit` shares) used
    // by rateBefore/rateAfter. Missing HWM → fall back to 0 (no gate), keeping
    // the prior behaviour for any vault without the getter.
    const hwmRate = hwms[i] != null ? (Number(hwms[i]) / 1e18) * unit : 0;
    const perfBasisStart = Math.max(Number(rateBefore), hwmRate);
    const perfRateGrowth = Number(rateAfter) - perfBasisStart;
    const perfYield =
      perfRateGrowth > 0 ? (avgSupply * perfRateGrowth) / unit : 0;

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
          (avgTvl * mgmtFeeFrac * timespan) /
          (mgmtFeeDays * SECONDS_PER_DAY);
      }
    }

    // Nothing to record for this vault if there is neither yield nor a fee.
    if (depositorYield <= 0 && performanceFees <= 0 && managementFees <= 0)
      continue;

    // Gross vault yield = everything the strategies produced this period
    // (depositor yield + curator performance/management fees). It is split
    // below between depositors and the vault curator, both supply-side.
    dailyFees.add(token, depositorYield + performanceFees + managementFees, "Vault Yield");

    // Supply side = net yield to depositors + curator fees. The curator is a
    // third-party vault manager (NOT the t3tris protocol), so its performance
    // and management fees are a supply-side cost, not protocol revenue.
    dailySupplySideRevenue.add(token, depositorYield, "Depositor Yield");
    dailySupplySideRevenue.add(token, performanceFees, "Curator Performance Fees");
    dailySupplySideRevenue.add(token, managementFees, "Curator Management Fees");
  }

  // 7. Track entry fees from DepositsSettled events → feeRecipient
  const depositLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.depositsSettled,
    flatten: true,
  });

  for (const log of depositLogs) {
    const entryFeeAssets = Number(log.entryFees);
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

  // 8. Track exit fees from RedemptionsSettled events → feeRecipient
  const redeemLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.redemptionsSettled,
    flatten: true,
  });

  for (const log of redeemLogs) {
    const exitFeeAssets = Number(log.exitFeeAssets);
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
  const profitLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.t3trisProfit,
    flatten: true,
  });

  for (const log of profitLogs) {
    const profit = Number(log.profit);
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
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "All value generated by the vaults: gross strategy yield (depositor yield + curator performance/management fees) + entry/exit fees + T3trisProfit (assets sent to the t3treasury).",
  SupplySideRevenue:
    "Value flowing to capital providers and the third-party vault curator: net depositor yield + curator performance, management, entry and exit fees. The curator is not t3tris.",
  Revenue:
    "T3tris protocol revenue — only assets transferred to the t3treasury (T3trisProfit). Curator fees (perf/mgmt/entry/exit) are NOT t3tris revenue. Off-chain payments for third-party services are also t3tris revenue but are not observable on-chain.",
  ProtocolRevenue:
    "Same as Revenue. T3trisProfit(uint256 profit) events — assets sent to the t3treasury.",
  HoldersRevenue: "No direct revenue share to token holders.",
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
  adapter: Object.keys(chainConfig).reduce(
    (acc, chain) => ({
      ...acc,
      [chain]: {
        fetch,
        start: chainConfig[chain].start,
      },
    }),
    {},
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
