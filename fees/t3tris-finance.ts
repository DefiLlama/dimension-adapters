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
 * (https://ecosystem.t3tris.finance/vaults); only vaults that are `verified`
 * and not `blacklisted` are indexed.
 *
 * Landing: https://t3tris.finance/   App: https://app.t3tris.finance/
 */

// T3tris ecosystem API — authoritative list of vaults with curation flags.
// Only vaults that are `verified` and not `blacklisted` are indexed.
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
// add a chain here once it goes live and the API returns verified vaults for it.
const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2025-01-01" },
};

const SECONDS_PER_DAY = 86400;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // 1. Discover verified, non-blacklisted vaults from the T3tris ecosystem API
  let vaults: string[];
  try {
    const chainId = chainConfig[options.chain].chainId;
    const all = await httpGet(VAULTS_API);
    vaults = (all || [])
      .filter(
        (v: any) =>
          v.verified && !v.blacklisted && Number(v.chainId) === chainId,
      )
      .map((v: any) => v.address);
  } catch {
    // API unreachable — report nothing for this run
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
  const convertCalls = vaults.map((vault: string, index: number) => ({
    target: vault,
    params: [String(10 ** Number(decimals[index] || 18))],
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

    if (netYield <= 0) continue;

    // Performance fee (WAD, 1e18 = 100%): perfFeeAmount = netYield × f / (1 - f)
    const perfFeeFrac = perfFees[i] ? Number(perfFees[i]) / 1e18 : 0;
    const performanceFees =
      perfFeeFrac > 0 ? (netYield * perfFeeFrac) / (1 - perfFeeFrac) : 0;

    // Management fee (WAD, 1e18 = 100%): totalAssets × f × (timespan / (mgmtDays × 86400))
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

    // Supply side = net yield to depositors (after all fees deducted)
    dailySupplySideRevenue.add(token, netYield);

    // Vault fees paid to feeRecipient (performance + management)
    // These are tracked in dailyFees but NOT in dailyRevenue
    dailyFees.add(token, performanceFees + managementFees);
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
        dailyFees.add(token, entryFeeAssets);
        // NOT added to dailyRevenue — goes to feeRecipient, not protocol
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
        dailyFees.add(token, exitFeeAssets);
        // NOT added to dailyRevenue — goes to feeRecipient, not protocol
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
        dailyFees.add(token, profit);
        dailyRevenue.add(token, profit);
        dailyProtocolRevenue.add(token, profit); // ONLY T3trisProfit goes to protocol
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
  Fees: "Vault fees collected by each vault's feeRecipient: performance fees (on profit above HWM) + management fees (annual % of TVL) + entry fees (on deposits) + exit fees (on withdrawals). Also includes T3trisProfit (assets sent to t3treasury). Does NOT include depositor yield.",
  SupplySideRevenue:
    "Net yield earned by vault depositors after all fees are deducted.",
  Revenue:
    "T3trisProfit only — assets transferred to the t3treasury. Vault fees (perf/mgmt/entry/exit) are NOT included in revenue.",
  ProtocolRevenue:
    "Same as Revenue. T3trisProfit(uint256 profit) events from each vault.",
  HoldersRevenue: "No direct revenue share to token holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
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
};

export default adapter;
