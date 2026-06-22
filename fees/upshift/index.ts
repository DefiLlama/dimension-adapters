import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { getERC4626VaultsYield } from "../../helpers/erc4626";

const UPSHIFT_API = 'https://api.upshift.finance/v1/tokenized_vaults';
const CHAIN_ID_MAP: any = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.BSC]: 56,
  [CHAIN.MONAD]: 143,
  [CHAIN.FLARE]: 14,
  [CHAIN.FLUENT]: 25363,
}
const ONE_YEAR = 365 * 24 * 60 * 60;

async function prefetch(_a: any): Promise<any> {
  return await getConfig('upshift-vaults', UPSHIFT_API);
}

// Reported NAV snapshot for off-chain valued vaults (multiAssetVault).
// asset_share_ratio is the NAV per share in asset units, underlying_price is asset->USD.
type Snapshot = {
  asset_share_ratio: number;
  total_shares: number;
  underlying_price: number;
  tvl: number; // USD
  snapshot_datetime: string;
};

const snapshotSeconds = (s: Snapshot) => Date.parse(s.snapshot_datetime.split('.')[0] + 'Z') / 1000;

// latest snapshot at or before the given timestamp (seconds)
function snapshotAt(snapshots: Snapshot[], timestamp: number): Snapshot | undefined {
  let best: Snapshot | undefined;
  let bestTs = -Infinity;
  for (const s of snapshots) {
    const ts = snapshotSeconds(s);
    if (ts <= timestamp && ts > bestTs) {
      bestTs = ts;
      best = s;
    }
  }
  return best;
}

// a date-string waiver is active while now < the waived-until date
const waivedByDate = (until: any, nowSeconds: number) => {
  if (!until) return false;
  const ts = Date.parse(until) / 1000;
  return !isNaN(ts) && ts > nowSeconds;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const vaultsData = options.preFetchedResults;
  if (!vaultsData)
    throw new Error("No upshift vaults data")

  const currentChainVaults = vaultsData.filter((vault: any) => vault.chain === CHAIN_ID_MAP[options.chain]);

  await Promise.allSettled(currentChainVaults.map(async (vault: any) => {
    const { address, weekly_performance_fee_bps, platform_fee_override, internal_type } = vault;
    const management_fee = platform_fee_override?.management_fee ?? 0;

    // weekly_performance_fee_bps holds the performance fee as a percentage of yield
    // (e.g. 10 = 10% of yield above the high watermark), waived while perf waiver is active.
    const perfFee = waivedByDate(vault.performance_fee_waived_until_date, options.toTimestamp)
      ? 0 : (weekly_performance_fee_bps ?? 0) / 100;
    const mgmtWaived = platform_fee_override?.is_fee_waived === true
      || waivedByDate(vault.management_fee_waived_until_date, options.toTimestamp);

    if (internal_type === 'multiAssetVault') {
      // multiAssetVault contracts expose no standard ERC4626 reads on-chain (asset() only);
      // NAV is reported off-chain, so value from the API's daily NAV snapshots.
      const snapshots: Snapshot[] = vault.historical_snapshots ?? [];
      const before = snapshotAt(snapshots, options.fromTimestamp);
      const after = snapshotAt(snapshots, options.toTimestamp);

      if (before && after && after !== before) {
        const netYieldUsd = (after.asset_share_ratio - before.asset_share_ratio) * after.total_shares * after.underlying_price;
        if (netYieldUsd > 0) {
          dailySupplySideRevenue.addUSDValue(netYieldUsd, 'Assets Yields To Suppliers');
          const grossYieldUsd = netYieldUsd / (1 - perfFee);
          dailyFees.addUSDValue(grossYieldUsd, METRIC.ASSETS_YIELDS);
          dailyRevenue.addUSDValue(grossYieldUsd - netYieldUsd, METRIC.PERFORMANCE_FEES);
        }
      }

      if (after && !mgmtWaived && management_fee) {
        const dailyManagementFee = after.tvl * (management_fee / 100) * ((options.toTimestamp - options.fromTimestamp) / ONE_YEAR);
        dailyFees.addUSDValue(dailyManagementFee, METRIC.MANAGEMENT_FEES);
        dailyRevenue.addUSDValue(dailyManagementFee, METRIC.MANAGEMENT_FEES);
      }
      return;
    }

    // tokenizedVault / lendingPool: standard ERC4626 reads on-chain.
    const dailyYield = await getERC4626VaultsYield({ options, vaults: [address] });
    const totalAssets = await options.api.call({
      target: address,
      abi: 'uint256:totalAssets',
      permitFailure: true,
    })
    const asset = await options.api.call({
      target: address,
      abi: 'address:asset',
      permitFailure: true,
    })

    if (+Object.values(dailyYield._balances)[0] > 0) {
      dailySupplySideRevenue.add(dailyYield, 'Assets Yields To Suppliers');
      dailyFees.add(dailyYield.clone(1 / (1 - perfFee)), METRIC.ASSETS_YIELDS);
      dailyRevenue.add(dailyYield.clone(1 / (1 - perfFee) - 1), METRIC.PERFORMANCE_FEES);
    }

    if (totalAssets && asset && !mgmtWaived && management_fee) {
      const dailyManagementFee = totalAssets * (management_fee / 100) * ((options.toTimestamp - options.fromTimestamp) / ONE_YEAR)
      dailyFees.add(asset, dailyManagementFee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(asset, dailyManagementFee, METRIC.MANAGEMENT_FEES);
    }
  }))

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'All yields generated from deposited assets in all vaults.',
  Revenue: 'Performance fees and management fees paid from user yields.',
  ProtocolRevenue: 'Performance fees and management fees paid from user yields.',
  SupplySideRevenue: 'Yields are distributed to vaults suppliers post fees.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Yields generated from deposited assets in all vaults.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees paid by vault users.',
    [METRIC.MANAGEMENT_FEES]: 'Management fees paid by vault users.',
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: 'Performance fees paid by vault users.',
    [METRIC.MANAGEMENT_FEES]: 'Management fees paid by vault users.',
  },
  SupplySideRevenue: {
    'Assets Yields To Suppliers': 'Yields generated are distributed to vaults suppliers post fees.',
  },
}

const adapter: Adapter = {
  version: 2,
  prefetch,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-09-15' },
    [CHAIN.AVAX]: { start: '2024-11-04' },
    [CHAIN.BASE]: { start: '2024-11-22' },
    [CHAIN.BSC]: { start: '2025-04-10' },
    [CHAIN.HYPERLIQUID]: { start: '2025-04-04' },
    [CHAIN.MONAD]: { start: '2025-11-23' },
    [CHAIN.FLARE]: { start: '2025-12-09' },
    [CHAIN.FLUENT]: { start: '2026-04-21' },
  },
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
