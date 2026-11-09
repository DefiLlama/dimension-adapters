import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const metricsUrl = "https://www.blast.fun/api/v1/defillama/metrics";
const secondsPerDay = 86_400;
// Blast publishes 100 rows per page. Bound requests even if the API keeps issuing new cursors.
const maxPages = 10_000;
const suiCoinType = `0x${"0".repeat(63)}2::sui::SUI`;
const coinTypePattern = /^0x[0-9a-f]{64}::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*(?:<.+>)?$/;
const feeMetrics = ["fees", "revenue", "protocol_revenue", "supply_side_revenue"] as const;
type FeeMetric = (typeof feeMetrics)[number];

const launchpadLabels = {
  creation: "Launch creation fees",
  curve_swaps: "Bonding curve swap fees",
  migration: "Launch migration fees",
  presale_raise: "Presale raise fees",
} as const;

const frontendLabels = {
  cetus_paid: "Blast frontend fees on Cetus",
  aftermath_paid: "Blast frontend fees on Aftermath",
} as const;

type FeeItem = {
  component: string;
  coin_type: string;
  included_in_totals: boolean;
  underlying_venue_overlap: boolean;
  metrics: Record<FeeMetric, unknown>;
  evidence: Partial<Record<keyof typeof frontendLabels, unknown>>;
};

type DailyPage = {
  schema_version: number;
  chain: string;
  network: string;
  methodology_version: string;
  date: string;
  start_timestamp: number;
  end_timestamp: number;
  snapshot_id: string;
  scope_coverage: Record<string, Record<FeeMetric, { status: string }>>;
  frontend_fee_coverage: { status: string };
  items: FeeItem[];
  next_cursor: string | null;
};

/** Read Blast's published daily token amounts into DeFiLlama balances. */
async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for await (const item of readDailyFees(options)) {
    const token = item.coin_type === suiCoinType ? "0x2::sui::SUI" : item.coin_type;
    for (const { label, fees, revenue, supply } of feeBreakdown(item)) {
      dailyFees.add(token, fees, label);
      dailyRevenue.add(token, revenue, label);
      dailySupplySideRevenue.add(token, supply, label);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

/** Follow the API's cursors within one published revision. */
async function* readDailyFees(options: FetchOptions) {
  const url = new URL(metricsUrl);
  url.searchParams.set("date", options.dateString);
  const cursors = new Set<string>();
  const seenRows = new Set<string>();
  let snapshotId: string | undefined;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page: DailyPage = await httpGet(url.toString(), { timeout: 15_000, maxRedirects: 0 });
    requireCompleteDay(page, options);
    if (snapshotId !== undefined && page.snapshot_id !== snapshotId) {
      throw new Error("Blast snapshot revision changed during pagination");
    }
    snapshotId = page.snapshot_id;

    for (const item of page.items) {
      if (item.included_in_totals !== true || item.underlying_venue_overlap !== false) {
        continue;
      }
      const rowKey = `${item.component}:${item.coin_type}`;
      if (!coinTypePattern.test(item.coin_type) || seenRows.has(rowKey)) {
        throw new Error(`Invalid or duplicate Blast fee row: ${rowKey}`);
      }
      seenRows.add(rowKey);
      yield item;
    }

    const cursor = page.next_cursor;
    if (cursor === null) {
      return;
    }
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) {
      throw new Error("Invalid Blast snapshot pagination");
    }
    cursors.add(cursor);
    url.searchParams.set("cursor", cursor);
  }
  throw new Error("Blast snapshot exceeded the page limit");
}

/** Reject partial days so missing receipts cannot be reported as zero fees. */
function requireCompleteDay(page: DailyPage, { dateString, startOfDay }: FetchOptions) {
  if (
    page?.schema_version !== 1 ||
    page.chain !== CHAIN.SUI ||
    page.network !== "mainnet" ||
    page.methodology_version !== "blast-defi-v4" ||
    page.date !== dateString ||
    page.start_timestamp !== startOfDay ||
    page.end_timestamp !== startOfDay + secondsPerDay ||
    typeof page.snapshot_id !== "string" ||
    !Array.isArray(page.items)
  ) {
    throw new Error(`Invalid Blast snapshot for ${dateString}`);
  }

  const complete = ["launchpad", "frontend_router"].every((scope) =>
    feeMetrics.every((metric) => page.scope_coverage?.[scope]?.[metric]?.status === "complete"),
  );
  if (!complete || page.frontend_fee_coverage?.status !== "complete") {
    throw new Error(`Incomplete Blast fee coverage for ${dateString}`);
  }
}

/** Map published amounts to the launchpad or frontend fee labels. */
function feeBreakdown({ component, metrics, evidence }: FeeItem) {
  const fees = amount(metrics.fees);
  const revenue = amount(metrics.revenue);
  const supply = amount(metrics.supply_side_revenue);

  if (metrics.protocol_revenue !== metrics.revenue || fees !== revenue + supply) {
    throw new Error(`Unreconciled Blast fee allocation for ${component}`);
  }

  if (component === "frontend_router_fees") {
    const cetus = amount(evidence.cetus_paid ?? "0");
    const aftermath = amount(evidence.aftermath_paid ?? "0");
    if (fees !== cetus + aftermath || revenue !== fees) {
      throw new Error("Unreconciled Blast frontend fees");
    }
    return [
      { label: frontendLabels.cetus_paid, fees: cetus, revenue: cetus, supply: 0n },
      { label: frontendLabels.aftermath_paid, fees: aftermath, revenue: aftermath, supply: 0n },
    ];
  }

  if (!Object.prototype.hasOwnProperty.call(launchpadLabels, component)) {
    throw new Error(`Unrecognized Blast fee component: ${component}`);
  }
  const label = launchpadLabels[component as keyof typeof launchpadLabels];
  return [{ label, fees, revenue, supply }];
}

/** Keep base units exact for allocation checks and token balances. */
function amount(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Invalid Blast fee amount");
  }
  return BigInt(value);
}

const feeDescriptions = {
  [launchpadLabels.creation]: "Fees paid to create Blast launches.",
  [launchpadLabels.curve_swaps]: "Fees paid on swaps against Blast bonding curves.",
  [launchpadLabels.migration]: "Fees charged when a launch graduates to an external pool.",
  [launchpadLabels.presale_raise]: "Fees charged on Blast presale proceeds.",
  [frontendLabels.cetus_paid]: "Settled fees paid to Blast on Cetus routes, excluding pool fees.",
  [frontendLabels.aftermath_paid]:
    "Settled fees paid to Blast on Aftermath routes, excluding DEX and DAO fees.",
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SUI],
  start: "2026-11-07",
  fetch,
  methodology: {
    Fees:
      "Blast launchpad fees and settled frontend fees paid to Blast on Cetus and Aftermath. " +
      "Excludes external DEX fees and vault LP yield.",
    Revenue: "Blast fees after deducting creator and partner shares.",
    ProtocolRevenue: "The portion of launchpad and frontend fees retained by Blast.",
    SupplySideRevenue: "Shares of Blast launchpad fees owed to creators and partners.",
  },
  breakdownMethodology: {
    Fees: feeDescriptions,
    UserFees: feeDescriptions,
    Revenue: feeDescriptions,
    ProtocolRevenue: feeDescriptions,
    SupplySideRevenue: {
      [launchpadLabels.creation]: "Creator and partner shares of launch creation fees.",
      [launchpadLabels.curve_swaps]: "Creator and partner shares of bonding curve swap fees.",
      [launchpadLabels.migration]: "Creator and partner shares of launch migration fees.",
      [launchpadLabels.presale_raise]: "Creator and partner shares of presale raise fees.",
    },
  },
};

export default adapter;
