import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// AutoRange — non-custodial Uniswap V3 concentrated-liquidity vault
// platform. Every trading fee a vault's position earns is split on-chain
// between the vault's owner (LP) and the platform, at rebalance time
// (rebalance()) or on manual claim (collectFees()) — see RangeVault.sol's
// _splitPerformanceFee(). Fees/Revenue here mirror that split exactly.
const config: Record<string, { factory: string; start: string }> = {
  [CHAIN.CELO]: { factory: "0xa431a0bD0978d872C720cD3E3277e31cd6026e90", start: "2026-07-16" },
  [CHAIN.ARBITRUM]: { factory: "0x93590F9a18Ed444dD90ECBeCA094aa9367452472", start: "2026-07-18" },
};

const lpFeesAbi = "event LpFeesPaidToOwner(uint256 amount0, uint256 amount1)";
const feesCollectedAbi = "event FeesCollected(uint256 amount0, uint256 amount1)";
const perfFeeAbi = "event PerformanceFeeCollected(uint256 amount0, uint256 amount1)";

const fetch = async (options: FetchOptions) => {
  const { factory } = config[options.chain];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults: string[] = await options.api.fetchList({ target: factory, lengthAbi: "vaultCount", itemAbi: "allVaults" });
  if (!vaults.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const [token0s, token1s] = await Promise.all([
    options.api.multiCall({ calls: vaults, abi: "address:token0" }),
    options.api.multiCall({ calls: vaults, abi: "address:token1" }),
  ]);

  const [ownerLogsA, ownerLogsB, platformLogs] = await Promise.all([
    options.getLogs({ targets: vaults, eventAbi: lpFeesAbi, flatten: false }),
    options.getLogs({ targets: vaults, eventAbi: feesCollectedAbi, flatten: false }),
    options.getLogs({ targets: vaults, eventAbi: perfFeeAbi, flatten: false }),
  ]);

  vaults.forEach((_, i) => {
    const token0 = token0s[i];
    const token1 = token1s[i];

    [...(ownerLogsA[i] ?? []), ...(ownerLogsB[i] ?? [])].forEach((log: any) => {
      dailyFees.add(token0, log.amount0, METRIC.SWAP_FEES);
      dailyFees.add(token1, log.amount1, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token0, log.amount0, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token1, log.amount1, METRIC.SWAP_FEES);
    });

    (platformLogs[i] ?? []).forEach((log: any) => {
      dailyFees.add(token0, log.amount0, METRIC.PERFORMANCE_FEES);
      dailyFees.add(token1, log.amount1, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(token0, log.amount0, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(token1, log.amount1, METRIC.PERFORMANCE_FEES);
    });
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Total Uniswap V3 trading fees earned by all AutoRange vaults' positions, realized on rebalance or when the vault owner manually claims — the full amount before the platform/owner split.",
  Revenue: "The platform's performance-fee cut of those trading fees, set per-vault by PlatformConfig and capped by the vault owner.",
  ProtocolRevenue: "The platform's performance-fee cut of those trading fees, set per-vault by PlatformConfig and capped by the vault owner.",
  SupplySideRevenue: "The vault owner's (LP's) net share of trading fees, after the platform's cut.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total Uniswap V3 trading fees earned by all AutoRange vaults' positions, realized on rebalance or when the vault owner manually claims — the full amount before the platform/owner split.",
    [METRIC.PERFORMANCE_FEES]: "The platform's performance-fee cut of those trading fees, set per-vault by PlatformConfig and capped by the vault owner.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "The platform's performance-fee cut of those trading fees, set per-vault by PlatformConfig and capped by the vault owner.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "The platform's performance-fee cut of those trading fees, set per-vault by PlatformConfig and capped by the vault owner.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "The vault owner's (LP's) net share of trading fees, after the platform's cut.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology,
  breakdownMethodology,
  doublecounted: true, // uniswap v3
};

export default adapter;
