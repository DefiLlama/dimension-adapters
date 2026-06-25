import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

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
 *   - dailyFees             = gross yield + entry/exit fees + T3trisProfit
 *   - dailySupplySideRevenue = net yield to depositors
 *   - dailyRevenue           = T3trisProfit only (assets sent to t3treasury)
 *   - dailyProtocolRevenue   = T3trisProfit only (= dailyRevenue)
 *
 *   Vault fees (perf/mgmt/entry/exit) are in dailyFees but NOT in dailyRevenue.
 *   They go to each vault's feeRecipient, not to the protocol.
 *
 * Vaults are sourced from the T3tris ecosystem API
 * (https://ecosystem.t3tris.finance/vaults); all vaults on the chain are
 * indexed (no curation filter — fees/revenue are tracked for every vault).
 *
 *   Why no `verified`/`blacklisted` filter here: those flags are purely an
 *   off-chain UI/curation concern. On-chain, every vault — verified or not,
 *   blacklisted or not — actually moves real assets: depositors earn yield,
 *   curators collect their perf/mgmt/entry/exit fees, and the t3treasury
 *   still receives its T3trisProfit transfers. The economic activity (and the
 *   fees the treasury collects) happens regardless of curation status, so all
 *   vaults must be counted to report fees & revenue accurately.
 *
 * Landing: https://t3tris.finance/   App: https://app.t3tris.finance/
 */

// T3tris ecosystem API — authoritative list of vaults with curation flags.
// All vaults on the chain are indexed (no curation filter applied here).
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
};

const EVENT_ABI = {
  depositsSettled:
    "event DepositsSettled(uint256 indexed requestId, uint256 assetsDeposited, uint256 sharesMinted, uint256 entryFees, uint256 unclaimedFees)",
  redemptionsSettled:
    "event RedemptionsSettled(uint256 indexed requestId, uint256 sharesToRedeem, uint256 assetsWithdrawn, uint256 sharesBurned, uint256 exitFeeAssets, uint256 unclaimedSharesFee, uint256 feeRecipientAmount)",
  // Assets transferred to t3treasury — the ONLY event tracking protocol revenue
  t3trisProfit: "event T3trisProfit(uint256 profit)",
};

// Supported chains: DefiLlama chain -> { ecosystem-API chainId, start }. T3tris
// is live on Arbitrum only for now (same CREATE3 addresses on every EVM chain);
// add a chain here once it goes live and the API returns vaults for it.
const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2025-01-01" },
};

const SECONDS_PER_DAY = 86400;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // 1. Discover all vaults for this chain from the T3tris ecosystem API.
  //    No curation filter — fees/revenue are tracked for every vault,
  //    regardless of verified/blacklisted status. The `verified`/`blacklisted`
  //    flags only affect off-chain UI curation; on-chain the assets still
  //    transit and the t3treasury still receives its fees (T3trisProfit) in
  //    every case, so all vaults are counted.
  let vaults: string[];
  try {
    const chainId = chainConfig[options.chain].chainId;
    const all = await httpGet(VAULTS_API);
    vaults = (all || [])
      .filter((v: any) => Number(v.chainId) === chainId)
      .map((v: any) => v.address);
  } catch (e) {
    // API unreachable — log and report nothing for this run so other chains continue
    console.error(`T3tris: failed to fetch vaults for ${options.chain}:`, e);
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

  // 5. Get fee configuration for each vault
  const [perfFees, mgmtFees] = await Promise.all([
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

    if (!token || !supply || !rateBefore || !rateAfter) continue;

    const unit = 10 ** decimal;
    const rateGrowth = Number(rateAfter) - Number(rateBefore);

    // Net yield to shareholders = totalSupply × delta(PPS) / unit
    // PPS already has perf/mgmt fees deducted (they dilute PPS via share minting)
    const netYield = (Number(supply) * rateGrowth) / unit;

    // Depositor yield and performance fees only accrue on positive yield;
    // management fees are charged on TVL × time and accrue regardless (see
    // below), so we no longer skip the whole vault on a flat/negative period.
    const depositorYield = netYield > 0 ? netYield : 0;

    // Performance fee (WAD, 1e18 = 100%): perfFeeAmount = netYield × f / (1 - f)
    const perfFeeFrac = perfFees[i] ? Number(perfFees[i]) / 1e18 : 0;
    const performanceFees =
      depositorYield > 0 && perfFeeFrac > 0
        ? (depositorYield * perfFeeFrac) / (1 - perfFeeFrac)
        : 0;

    // Management fee (WAD, 1e18 = 100%): totalAssets × f × (timespan / (mgmtDays × 86400))
    // Charged on TVL over time, so it accrues even on flat or negative periods.
    let managementFees = 0;
    if (mgmtFees[i] && tvl) {
      const mgmtFeeFrac = Number(mgmtFees[i].managementFeeWad || 0) / 1e18;
      const mgmtFeeDays = Number(mgmtFees[i].managementFeeDays || 365);
      if (mgmtFeeFrac > 0 && mgmtFeeDays > 0) {
        managementFees =
          (Number(tvl) * mgmtFeeFrac * timespan) /
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
