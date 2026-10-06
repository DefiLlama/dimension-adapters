import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Primary data:
// https://github.com/xnet-community-data/xnet-data-integration/blob/main/data/xnet_defillama_revenue.json
//
// Public policy sources:
// https://github.com/XNET-Foundation/XIP
// https://github.com/XNET-Foundation/XIP/blob/main/XIP-12.md
// https://github.com/XNET-Foundation/XIP/blob/main/xip-13-1.md

const REVENUE_URL =
  "https://raw.githubusercontent.com/" +
  "xnet-community-data/xnet-data-integration/main/data/xnet_defillama_revenue.json";

const CARRIER_WIFI_OFFLOAD_FEES = "Carrier WiFi Offload Fees";
const CARRIER_WIFI_OFFLOAD_RETAINED =
  "Carrier WiFi Offload Fees Retained";
const FIAT_DEPLOYER_PAYOUTS =
  "Carrier WiFi Offload Fees To Fiat Deployers";
const ACCRUED_BBB = "Accrued Buyback & Burn Allocation";
const FIAT_BBB = "Fiat Facilitation BBB Allocation";
const OPERATIONS_REVENUE = "Operations";
const PROTOCOL_OWNED_LIQUIDITY = "Protocol-owned liquidity";

interface DailyRevenueRow {
  date: string;
  service_month: string;
  fees_usd: number;
  user_fees_usd: number;
  revenue_usd: number;
  supply_side_revenue_usd: number;
  holders_revenue_usd: number;
  protocol_revenue_usd: number;
  ordinary_holders_revenue_usd: number;
  ordinary_operations_revenue_usd: number;
  ordinary_protocol_owned_liquidity_usd: number;
  ordinary_protocol_revenue_usd: number;
  fiat_gross_allocation_usd: number;
  fiat_operator_payout_usd: number;
  fiat_bbb_allocation_usd: number;
  fiat_operations_allocation_usd: number;
  basis: string;
  fiat_allocation_basis?: string | null;
}

interface RevenueFeed {
  schema_version: number;
  daily_data: DailyRevenueRow[];
}

// Feed monetary fields are already rounded to cents and validated upstream.
// This epsilon is only for IEEE-754 addition/subtraction noise in JavaScript;
// it is six orders of magnitude below $1 and far below one cent.
const FLOAT_EPSILON_USD = 1e-6;

const finiteNonNegative = (
  value: unknown,
  field: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `Invalid XNET revenue feed value for ${field}: ${String(value)}`,
    );
  }
  return value;
};

const closeEnough = (
  left: number,
  right: number,
): boolean => Math.abs(left - right) <= FLOAT_EPSILON_USD;

const fetch = async (options: FetchOptions) => {
  const response: RevenueFeed = await fetchURL(REVENUE_URL);

  if (
    !response ||
    response.schema_version < 4 ||
    !Array.isArray(response.daily_data) ||
    response.daily_data.length === 0
  ) {
    throw new Error(
      "Unexpected XNET daily revenue feed response; schema v4+ is required",
    );
  }

  const dates = response.daily_data
    .map((row) => {
      const date = row.date;

      if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        throw new Error(
          `Invalid XNET daily row date: ${String(date)}`,
        );
      }

      const parsedDate = new Date(
        `${date}T00:00:00.000Z`,
      );

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
        throw new Error(
          `Invalid XNET daily row date: ${date}`,
        );
      }

      return date;
    })
    .sort();

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // DeFiLlama may request dates outside the published service window while
  // refilling. Those are genuinely out of range, not missing observations.
  if (
    options.dateString < firstDate ||
    options.dateString > lastDate
  ) {
    return {};
  }

  const rows = response.daily_data.filter(
    (row) => row.date === options.dateString,
  );

  // A missing or duplicate row inside the covered interval is a data-quality
  // failure. Never silently convert it to zero or double-count it.
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one XNET daily row for ${options.dateString}; found ${rows.length}`,
    );
  }

  const row = rows[0];

  const feesUsd = finiteNonNegative(row.fees_usd, "fees_usd");
  const userFeesUsd = finiteNonNegative(
    row.user_fees_usd,
    "user_fees_usd",
  );
  const revenueUsd = finiteNonNegative(
    row.revenue_usd,
    "revenue_usd",
  );
  const supplySideRevenueUsd = finiteNonNegative(
    row.supply_side_revenue_usd,
    "supply_side_revenue_usd",
  );
  const holdersRevenueUsd = finiteNonNegative(
    row.holders_revenue_usd,
    "holders_revenue_usd",
  );
  const protocolRevenueUsd = finiteNonNegative(
    row.protocol_revenue_usd,
    "protocol_revenue_usd",
  );

  const ordinaryHoldersRevenueUsd = finiteNonNegative(
    row.ordinary_holders_revenue_usd,
    "ordinary_holders_revenue_usd",
  );
  const ordinaryOperationsRevenueUsd = finiteNonNegative(
    row.ordinary_operations_revenue_usd,
    "ordinary_operations_revenue_usd",
  );
  const ordinaryLiquidityRevenueUsd = finiteNonNegative(
    row.ordinary_protocol_owned_liquidity_usd,
    "ordinary_protocol_owned_liquidity_usd",
  );
  const ordinaryProtocolRevenueUsd = finiteNonNegative(
    row.ordinary_protocol_revenue_usd,
    "ordinary_protocol_revenue_usd",
  );

  const fiatGrossAllocationUsd = finiteNonNegative(
    row.fiat_gross_allocation_usd,
    "fiat_gross_allocation_usd",
  );
  const fiatOperatorPayoutUsd = finiteNonNegative(
    row.fiat_operator_payout_usd,
    "fiat_operator_payout_usd",
  );
  const fiatBbbUsd = finiteNonNegative(
    row.fiat_bbb_allocation_usd,
    "fiat_bbb_allocation_usd",
  );
  const fiatOperationsUsd = finiteNonNegative(
    row.fiat_operations_allocation_usd,
    "fiat_operations_allocation_usd",
  );

  if (!closeEnough(userFeesUsd, feesUsd)) {
    throw new Error("XNET feed invariant failed: UserFees != Fees");
  }

  if (
    !closeEnough(
      feesUsd,
      revenueUsd + supplySideRevenueUsd,
    )
  ) {
    throw new Error(
      "XNET feed invariant failed: Fees != Revenue + SupplySideRevenue",
    );
  }

  if (
    !closeEnough(
      ordinaryProtocolRevenueUsd,
      ordinaryOperationsRevenueUsd +
        ordinaryLiquidityRevenueUsd,
    )
  ) {
    throw new Error(
      "XNET feed invariant failed: ordinary ProtocolRevenue components do not reconcile",
    );
  }

  if (
    !closeEnough(
      fiatGrossAllocationUsd,
      fiatOperatorPayoutUsd +
        fiatBbbUsd +
        fiatOperationsUsd,
    )
  ) {
    throw new Error(
      "XNET feed invariant failed: XIP-13.1 fiat components do not reconcile",
    );
  }

  if (!closeEnough(supplySideRevenueUsd, fiatOperatorPayoutUsd)) {
    throw new Error(
      "XNET feed invariant failed: SupplySideRevenue != fiat operator payout",
    );
  }

  if (
    !closeEnough(
      holdersRevenueUsd,
      ordinaryHoldersRevenueUsd + fiatBbbUsd,
    )
  ) {
    throw new Error(
      "XNET feed invariant failed: HoldersRevenue components do not reconcile",
    );
  }

  if (
    !closeEnough(
      protocolRevenueUsd,
      ordinaryProtocolRevenueUsd + fiatOperationsUsd,
    )
  ) {
    throw new Error(
      "XNET feed invariant failed: ProtocolRevenue components do not reconcile",
    );
  }

  if (
    fiatGrossAllocationUsd > 0 &&
    row.fiat_allocation_basis !==
      "xip_13_1_carrier_settlement_reconciliation"
  ) {
    throw new Error(
      "Unexpected XNET fiat-deployer attribution basis",
    );
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (feesUsd > 0) {
    dailyFees.addUSDValue(
      feesUsd,
      CARRIER_WIFI_OFFLOAD_FEES,
    );
  }

  if (revenueUsd > 0) {
    dailyRevenue.addUSDValue(
      revenueUsd,
      CARRIER_WIFI_OFFLOAD_RETAINED,
    );
  }

  if (fiatOperatorPayoutUsd > 0) {
    dailySupplySideRevenue.addUSDValue(
      fiatOperatorPayoutUsd,
      FIAT_DEPLOYER_PAYOUTS,
    );
  }

  if (ordinaryHoldersRevenueUsd > 0) {
    dailyHoldersRevenue.addUSDValue(
      ordinaryHoldersRevenueUsd,
      ACCRUED_BBB,
    );
  }

  if (fiatBbbUsd > 0) {
    dailyHoldersRevenue.addUSDValue(
      fiatBbbUsd,
      FIAT_BBB,
    );
  }

  const operationsRevenueUsd =
    ordinaryOperationsRevenueUsd + fiatOperationsUsd;

  if (operationsRevenueUsd > 0) {
    dailyProtocolRevenue.addUSDValue(
      operationsRevenueUsd,
      OPERATIONS_REVENUE,
    );
  }

  if (ordinaryLiquidityRevenueUsd > 0) {
    dailyProtocolRevenue.addUSDValue(
      ordinaryLiquidityRevenueUsd,
      PROTOCOL_OWNED_LIQUIDITY,
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // The public XNET source publishes one service-accrual row per UTC date,
  // not hourly observations, so hourly pulls would duplicate the same daily
  // accounting rather than add real resolution.
  pullHourly: false,
  fetch,
  chains: [CHAIN.OFF_CHAIN],

  // DeFiLlama treats start as a lower boundary. The first daily service
  // accrual is 2024-09-01, so use the preceding date.
  start: "2024-08-31",

  methodology: {
    Fees:
      "Carriers pay XNET for mobile data offloaded onto WiFi. Until settlement arrives, Fees are conservatively accrued from measured daily offload. Closed unsettled months use XNET's official monthly projection and newer days use a conservative API-GB rate. Carrier payments typically settle about two months later, and historical accrual is reconciled to the amount actually paid.",

    Revenue:
      "Carrier WiFi offload Fees retained within XNET after payments to operators that elect fiat compensation under XIP-13.1.",

    SupplySideRevenue:
      "Passed XIP-13.1 lets designated operators choose fiat instead of token distributions. Their 75% operator cash share is Supply-Side Revenue and is attributed to the service month reconciled by the carrier settlement that funds the payout, preserving the observed NET60+ settlement cadence.",

    HoldersRevenue:
      "Accrued service-period tokenholder allocation. Historically 80% of ordinary carrier Fees accrued to buyback-and-burn; under passed XIP-12, 60% does. The XIP-13.1 fiat slice contributes its 5% facilitation/BBB allocation. Values are provisional wherever the underlying Fees are provisional and reconcile with settlement. This is accrual attribution; actual on-chain buyback or burn execution can occur later.",

    ProtocolRevenue:
      "Historically 20% of ordinary carrier Fees was allocated to operations. Under passed XIP-12, Protocol Revenue is 40%: 20% operations and 20% protocol-owned liquidity. For the XIP-13.1 fiat slice, 20% is retained for XNET operations.",
  },

  breakdownMethodology: {
    Fees: {
      [CARRIER_WIFI_OFFLOAD_FEES]:
        "Gross carrier WiFi offload service Fees. Daily values are shaped by network offload, use official monthly projections when available, and are reconciled to actual carrier settlement.",
    },

    Revenue: {
      [CARRIER_WIFI_OFFLOAD_RETAINED]:
        "Carrier WiFi offload Fees retained within XNET after subtracting XIP-13.1 fiat-operator payouts.",
    },

    SupplySideRevenue: {
      [FIAT_DEPLOYER_PAYOUTS]:
        "Fiat compensation to designated operators under passed XIP-13.1. The operator cash share is 75% of that operator's gross fiat service allocation.",
    },

    HoldersRevenue: {
      [ACCRUED_BBB]:
        "Service-period buyback-and-burn allocation for ordinary carrier Fees: historically 80%, and 60% under passed XIP-12. It follows the same provisional-and-reconciled accrual basis as Fees.",
      [FIAT_BBB]:
        "XIP-13.1 facilitation/BBB allocation equal to 5% of the fiat operator's gross service allocation.",
    },

    ProtocolRevenue: {
      [OPERATIONS_REVENUE]:
        "Operations allocation: 20% of ordinary carrier Fees, plus the 20% operations portion of any XIP-13.1 fiat-operator service allocation.",
      [PROTOCOL_OWNED_LIQUIDITY]:
        "Under passed XIP-12, 20% of ordinary carrier Fees is allocated to protocol-owned liquidity.",
    },
  },
};

export default adapter;
