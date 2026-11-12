import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";

const UPSHIFT_API = "https://api.upshift.finance/v1/tokenized_vaults";

// NEMO Trading is a risk curator running two Upshift-infrastructure vaults on Ethereum.
// Explicit address list rather than a curator/protocol tag: the Upshift API has no `protocol`
// field - curator identity only shows up informally as `hardcoded_strategists[].strategist_name`
// ('NEMO' on both vaults below), which isn't a stable enough key to filter the whole Upshift
// vault list on. This is a separate curator from fees/sentora.ts's own Upshift vaults (Sentora's
// filter comes from Sentora's own API, services.vaults.sentora.com, which does not list these).
const USDC_PRIME = "0x955256B31097dDf47a9E47A95aDfDFB4460D8522";
const ETH_PRIME = "0xA422C3018C46ba90a14AcD14f96CB60616F5c91B";
const NEMO_VAULTS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [USDC_PRIME, ETH_PRIME],
};

// ETH Prime's own Upshift description says it translates NEMO USDC Prime's strategy into
// ETH terms, which raised a double-counting question (also flagged by the TVL adapter, PR
// #21104, which nets ~$5M of NAV it found nested between the two). Checked directly on-chain
// (2026-09-18): ETH Prime's receipt-token balance of USDC Prime is 0 in both directions, and
// neither vault has ever emitted a SubAccountEnabled event (the mechanism the TVL adapter uses
// to find nested subaccount holdings). So there is currently no verifiable on-chain nesting to
// net out here - the TVL PR's $5M may have since unwound, or routes through infrastructure this
// check can't see. Per "no number beats a wrong number", this ships without speculative netting
// logic for a position that doesn't currently show up on-chain; re-check if either vault's TVL
// jumps unexpectedly relative to Upshift's own reported total.
const YEAR_SECS = 365 * 24 * 60 * 60;

const toNum = (v: any): number => Number(v ?? 0);

const waivedByDate = (until: any, nowSeconds: number): boolean => {
  if (!until) return false;
  const ts = Date.parse(until) / 1000;
  return !isNaN(ts) && ts > nowSeconds;
};

type Snapshot = {
  asset_share_ratio: number;
  total_shares: number;
  underlying_price: number;
  tvl: number;
  snapshot_datetime: string;
};

function snapshotAt(snapshots: Snapshot[], timestamp: number): Snapshot | undefined {
  let best: Snapshot | undefined;
  let bestTs = -Infinity;
  for (const s of snapshots) {
    const ts = Date.parse(String(s.snapshot_datetime).split(".")[0] + "Z") / 1000;
    if (ts <= timestamp && ts > bestTs) {
      bestTs = ts;
      best = s;
    }
  }
  return best;
}

const perfFeeOf = (info: any, nowSeconds: number): number =>
  info && !waivedByDate(info.performance_fee_waived_until_date, nowSeconds)
    ? toNum(info.weekly_performance_fee_bps) / 100
    : 0;

// Management-fee waiver is gated on `platform_fee_override.is_fee_waived`, a different flag
// from the performance-fee waiver above.
const mgmtFeeOf = (info: any, nowSeconds: number): number => {
  const override = info?.platform_fee_override;
  if (!override) return 0;
  if (override.is_fee_waived === true) return 0;
  if (waivedByDate(info.management_fee_waived_until_date, nowSeconds)) return 0;
  return toNum(override.management_fee) / 100;
};

function accrueVault(
  balances: { dailyFees: any; dailyRevenue: any; dailySupplySideRevenue: any },
  info: any,
  before: Snapshot | undefined,
  after: Snapshot | undefined,
  toTimestamp: number,
  fromTimestamp: number,
  feesLabel: string,
  perfLabel: string,
  mgmtLabel: string,
  supplyLabel: string,
) {
  if (before && after && after !== before) {
    const netYieldUsd = (after.asset_share_ratio - before.asset_share_ratio) * after.total_shares * after.underlying_price;
    if (netYieldUsd) {
      const perfFee = perfFeeOf(info, toTimestamp);
      const grossYieldUsd = perfFee > 0 && perfFee < 1 ? netYieldUsd / (1 - perfFee) : netYieldUsd;
      const perf = grossYieldUsd - netYieldUsd;
      balances.dailyFees.addUSDValue(grossYieldUsd, feesLabel);
      if (perf) balances.dailyRevenue.addUSDValue(perf, perfLabel);
      balances.dailySupplySideRevenue.addUSDValue(netYieldUsd, supplyLabel);
    }
  }
  const mgmtFeeRate = mgmtFeeOf(info, toTimestamp);
  if (mgmtFeeRate && after) {
    const dailyMgmt = (after.tvl * mgmtFeeRate * (toTimestamp - fromTimestamp)) / YEAR_SECS;
    if (dailyMgmt) {
      balances.dailyFees.addUSDValue(dailyMgmt, mgmtLabel);
      balances.dailyRevenue.addUSDValue(dailyMgmt, mgmtLabel);
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults = NEMO_VAULTS[options.chain];
  if (!vaults?.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const upshiftVaults: any[] = await getConfig("upshift-vaults", UPSHIFT_API);
  const byAddress = new Map<string, any>(upshiftVaults.map((v) => [String(v.address).toLowerCase(), v]));
  const usdcInfo = byAddress.get(USDC_PRIME.toLowerCase());
  const ethInfo = byAddress.get(ETH_PRIME.toLowerCase());

  // Either vault missing from the API response (removed/renamed/not indexed yet) - skip the
  // whole day rather than book a partial, misleading number.
  if (!usdcInfo || !ethInfo) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // Both vaults are multiAssetVault today (no ERC4626 on-chain rate reads). If Upshift ever
  // migrates either to a standard tokenizedVault this needs the ERC4626 branch fees/sentora.ts
  // already has - not implemented here since it isn't the current shape.
  if (usdcInfo.internal_type !== "multiAssetVault" || ethInfo.internal_type !== "multiAssetVault") {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  }

  const balances = { dailyFees, dailyRevenue, dailySupplySideRevenue };
  const usdcSnaps: Snapshot[] = usdcInfo.historical_snapshots ?? [];
  const ethSnaps: Snapshot[] = ethInfo.historical_snapshots ?? [];

  accrueVault(
    balances,
    usdcInfo,
    snapshotAt(usdcSnaps, options.fromTimestamp),
    snapshotAt(usdcSnaps, options.toTimestamp),
    options.toTimestamp,
    options.fromTimestamp,
    "NEMO USDC Prime Yields",
    "NEMO USDC Prime Performance Fees",
    "NEMO USDC Prime Management Fees",
    "NEMO USDC Prime Yields Distributed To Suppliers",
  );
  accrueVault(
    balances,
    ethInfo,
    snapshotAt(ethSnaps, options.fromTimestamp),
    snapshotAt(ethSnaps, options.toTimestamp),
    options.toTimestamp,
    options.fromTimestamp,
    "NEMO ETH Prime Yields",
    "NEMO ETH Prime Performance Fees",
    "NEMO ETH Prime Management Fees",
    "NEMO ETH Prime Yields Distributed To Suppliers",
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Total yields generated by assets deposited in NEMO Trading's two Upshift vaults (NEMO USDC Prime, NEMO ETH Prime), from the Upshift API's NAV snapshots.",
  Revenue: "Performance fees (NEMO USDC Prime only - NEMO ETH Prime currently charges none) and management fees on both vaults, retained by NEMO Trading as curator.",
  ProtocolRevenue: "Performance fees (NEMO USDC Prime only) and management fees on both vaults, retained by NEMO Trading as curator.",
  SupplySideRevenue: "Yields distributed to depositors of each vault after NEMO Trading's fees.",
};

const breakdownMethodology = {
  Fees: {
    "NEMO USDC Prime Yields": "Yield generated by NEMO USDC Prime (supplier yield + curator performance fee).",
    "NEMO USDC Prime Management Fees": "Annualized management fee on NEMO USDC Prime TVL, from the Upshift API's platform_fee_override.",
    "NEMO ETH Prime Yields": "Yield generated by NEMO ETH Prime's own depositors (ETH-denominated translation of its position).",
    "NEMO ETH Prime Management Fees": "Annualized management fee on NEMO ETH Prime TVL, from the Upshift API's platform_fee_override.",
  },
  Revenue: {
    "NEMO USDC Prime Performance Fees": "Performance fee on NEMO USDC Prime yields, per the Upshift API's weekly_performance_fee_bps (currently 20 -> 20%).",
    "NEMO USDC Prime Management Fees": "Management fee on NEMO USDC Prime TVL (currently 2% annualized).",
    "NEMO ETH Prime Performance Fees": "Performance fee on NEMO ETH Prime yields (currently 0bps - none charged).",
    "NEMO ETH Prime Management Fees": "Management fee on NEMO ETH Prime TVL (currently 1% annualized).",
  },
  ProtocolRevenue: {
    "NEMO USDC Prime Performance Fees": "Performance fee on NEMO USDC Prime yields, per the Upshift API's weekly_performance_fee_bps (currently 20 -> 20%).",
    "NEMO USDC Prime Management Fees": "Management fee on NEMO USDC Prime TVL (currently 2% annualized).",
    "NEMO ETH Prime Performance Fees": "Performance fee on NEMO ETH Prime yields (currently 0bps - none charged).",
    "NEMO ETH Prime Management Fees": "Management fee on NEMO ETH Prime TVL (currently 1% annualized).",
  },
  SupplySideRevenue: {
    "NEMO USDC Prime Yields Distributed To Suppliers": "Net yield distributed to NEMO USDC Prime depositors after fees.",
    "NEMO ETH Prime Yields Distributed To Suppliers": "Net yield distributed to NEMO ETH Prime depositors after fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    // NEMO ETH Prime start_datetime (2026-03-10); NEMO USDC Prime launched later (2026-06-25),
    // handled naturally by snapshotAt returning undefined before a vault's first snapshot.
    [CHAIN.ETHEREUM]: { fetch, start: "2026-03-10" },
  },
  // Losses are recorded, not clamped to zero - matches fees/sentora.ts's convention for the
  // same multiAssetVault branch.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
