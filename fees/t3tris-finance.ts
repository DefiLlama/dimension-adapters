import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

/**
 * T3tris Finance — Fees & Revenue Adapter
 *
 * T3tris is a vault protocol with ERC4626 vaults deployed via a factory.
 * Revenue comes from:
 *   - Performance fees (% of profit above high-water mark)
 *   - Management fees (annual % of TVL, prorated by managementFeeDays)
 *   - Entry fees on deposits (from DepositsSettled events)
 *   - Exit fees on withdrawals (from RedemptionsSettled events)
 *
 * Yield is tracked via share price growth (convertToAssets rate delta).
 * Entry/exit fees are tracked via on-chain events emitted by each vault.
 *
 * Factory address is deterministic (CREATE3) — same on all chains.
 */

// T3tris protocol factory — deterministic CREATE3 address
const T3TRIS_FACTORY = "0x7DD63c4eE5CD277B7870155371a6d62A2f7b1652";

const ABI = {
  getDeployedVaultsCount:
    "function getDeployedVaultsCount() external view returns (uint256)",
  getDeployedVaults:
    "function getDeployedVaults(uint256, uint256) external view returns (address[])",
  asset: "address:asset",
  decimals: "uint8:decimals",
  totalAssets: "uint256:totalAssets",
  totalSupply: "uint256:totalSupply",
  convertToAssets:
    "function convertToAssets(uint256) view returns (uint256)",
  getPerfFee: "function getPerfFee() external view returns (uint16)",
  getManagementFee:
    "function getManagementFee() external view returns (uint16 managementFeeBps, uint32 managementFeeDays)",
};

const EVENT_ABI = {
  depositsSettled:
    "event DepositsSettled(uint256 indexed requestId, uint256 assetsDeposited, uint256 sharesMinted, uint256 entryFees, uint256 unclaimedFees)",
  redemptionsSettled:
    "event RedemptionsSettled(uint256 indexed requestId, uint256 sharesToRedeem, uint256 assetsWithdrawn, uint256 sharesBurned, uint256 exitFeeAssets, uint256 unclaimedSharesFee, uint256 feeRecipientAmount)",
};

// Supported chains (will expand as T3tris deploys)
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2025-01-01" },
  [CHAIN.ARBITRUM]: { start: "2025-01-01" },
  [CHAIN.BASE]: { start: "2025-01-01" },
  [CHAIN.OPTIMISM]: { start: "2025-01-01" },
  [CHAIN.POLYGON]: { start: "2025-01-01" },
  [CHAIN.AVAX]: { start: "2025-01-01" },
  [CHAIN.BSC]: { start: "2025-01-01" },
  [CHAIN.LINEA]: { start: "2025-01-01" },
  [CHAIN.SCROLL]: { start: "2025-01-01" },
  [CHAIN.BLAST]: { start: "2025-01-01" },
  [CHAIN.MANTLE]: { start: "2025-01-01" },
  [CHAIN.MODE]: { start: "2025-01-01" },
  [CHAIN.XDAI]: { start: "2025-01-01" },
  [CHAIN.FANTOM]: { start: "2025-01-01" },
  [CHAIN.SONIC]: { start: "2025-01-01" },
};

const SECONDS_PER_DAY = 86400;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Discover all vaults from factory
  let count: number;
  try {
    count = await options.api.call({
      abi: ABI.getDeployedVaultsCount,
      target: T3TRIS_FACTORY,
    });
  } catch {
    // Factory not deployed on this chain yet
    return {};
  }

  if (count == 0) return {};

  const vaults: string[] = await options.api.call({
    abi: ABI.getDeployedVaults,
    target: T3TRIS_FACTORY,
    params: [0, count - 1],
  });

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
      abi: ABI.getPerfFee,
      calls: vaults,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: ABI.getManagementFee,
      calls: vaults,
      permitFailure: true,
    }),
  ]);

  // 6. Calculate daily yield and split into fee categories
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
    // This already has perf/mgmt fees deducted (they dilute PPS via share minting)
    const netYield = (Number(supply) * rateGrowth) / unit;

    if (netYield <= 0) continue;

    // Performance fee: if perfFeeBps = 2000 (20%), gross yield ≈ netYield / (1 - 0.20)
    // perfFeeAmount = grossYield - netYield = netYield * perfFeeBps / (10000 - perfFeeBps)
    const perfFeeBps = perfFees[i] ? Number(perfFees[i]) : 0;
    const performanceFees =
      perfFeeBps > 0
        ? (netYield * perfFeeBps) / (10000 - perfFeeBps)
        : 0;

    // Management fee: annual fee prorated to the observation period
    // mgmtFeeDaily = totalAssets × mgmtFeeBps / 10000 × (timespan / (managementFeeDays × 86400))
    let managementFees = 0;
    if (mgmtFees[i] && tvl) {
      const mgmtFeeBps = Number(mgmtFees[i].managementFeeBps || 0);
      const mgmtFeeDays = Number(mgmtFees[i].managementFeeDays || 365);
      if (mgmtFeeBps > 0 && mgmtFeeDays > 0) {
        managementFees =
          (Number(tvl) * mgmtFeeBps * timespan) /
          (10000 * mgmtFeeDays * SECONDS_PER_DAY);
      }
    }

    // Record breakdown
    // Supply side = net yield to depositors
    dailySupplySideRevenue.add(token, netYield, METRIC.ASSETS_YIELDS);

    // Total fees = gross yield = net yield + perf fees + mgmt fees
    dailyFees.add(token, netYield, METRIC.ASSETS_YIELDS);
    if (performanceFees > 0) {
      dailyFees.add(token, performanceFees, METRIC.PERFORMANCE_FEES);
    }
    if (managementFees > 0) {
      dailyFees.add(token, managementFees, METRIC.MANAGEMENT_FEES);
    }

    // Protocol revenue = perf fees + mgmt fees (to T3tris treasury)
    if (performanceFees > 0) {
      dailyRevenue.add(token, performanceFees, METRIC.PERFORMANCE_FEES);
    }
    if (managementFees > 0) {
      dailyRevenue.add(token, managementFees, METRIC.MANAGEMENT_FEES);
    }
  }

  // 7. Track entry fees from DepositsSettled events
  const depositLogs = await options.getLogs({
    targets: vaults,
    eventAbi: EVENT_ABI.depositsSettled,
    flatten: true,
  });

  for (const log of depositLogs) {
    const entryFeeAssets = Number(log.entryFees);
    if (entryFeeAssets > 0) {
      // Find which vault emitted this to get its underlying asset
      const vaultAddr = (log as any).address?.toLowerCase();
      const vaultIndex = vaults.findIndex(
        (v: string) => v.toLowerCase() === vaultAddr
      );
      const token = vaultIndex >= 0 ? assets[vaultIndex] : null;
      if (token) {
        dailyFees.add(token, entryFeeAssets, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.add(token, entryFeeAssets, METRIC.DEPOSIT_WITHDRAW_FEES);
      }
    }
  }

  // 8. Track exit fees from RedemptionsSettled events
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
        (v: string) => v.toLowerCase() === vaultAddr
      );
      const token = vaultIndex >= 0 ? assets[vaultIndex] : null;
      if (token) {
        dailyFees.add(token, exitFeeAssets, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.add(token, exitFeeAssets, METRIC.DEPOSIT_WITHDRAW_FEES);
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees:
    "Total value generated by T3tris vaults, including yield distributed to depositors, performance fees, management fees, and entry/exit fees on deposits and withdrawals.",
  SupplySideRevenue:
    "Net yield earned by vault depositors after performance and management fees are deducted.",
  Revenue:
    "Performance fees (on profits above high-water mark), management fees (annual % of TVL), and entry/exit fees collected by the T3tris protocol.",
  ProtocolRevenue:
    "Same as Revenue — all protocol fees flow to the T3tris treasury and fee recipients.",
  HoldersRevenue: "No direct revenue share to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]:
      "Yield generated from underlying strategies (e.g., AAVE) distributed to vault depositors.",
    [METRIC.PERFORMANCE_FEES]:
      "Performance fees charged on vault profits above the high-water mark.",
    [METRIC.MANAGEMENT_FEES]:
      "Management fees charged as an annual percentage of vault TVL.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]:
      "Entry fees on deposits and exit fees on withdrawals, charged at settlement time.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]:
      "Net yield distributed to vault depositors after all fees.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by T3tris treasury.",
    [METRIC.MANAGEMENT_FEES]: "Management fees collected by T3tris treasury.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]:
      "Entry and exit fees collected at deposit/withdrawal settlement.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by T3tris treasury.",
    [METRIC.MANAGEMENT_FEES]: "Management fees collected by T3tris treasury.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]:
      "Entry and exit fees collected at deposit/withdrawal settlement.",
  },
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
    {}
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
