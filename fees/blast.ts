import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const endpoint = "https://www.blast.fun/api/v1/defillama/metrics";
// Blast's November 6 canonical Sui deployment, as published in blast-deployments-sdk 0.2.0.
// Native receipts come from the original Blast launchpad, presale, core and vault packages in
// https://github.com/interest-protocol/blast-v2-contracts/blob/main/deployments/sui/mainnet/2026-11-06-canonical-launch-stack.json
const fingerprint = "1ed53cc04a5f43daf960754983894197c9abfa72057690b10d7b4545191bf9d9";
const coinType = /^0x[0-9a-f]{64}::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*(?:<.+>)?$/;
const paddedSui = `0x${"0".repeat(63)}2::sui::SUI`;

const sources = {
  creation: "Launch creation fees",
  curve_swaps: "Bonding curve swap fees",
  migration: "Launch migration fees",
  presale_raise: "Presale raise fees",
} as const;

// The API resolves the approved fee wallets and router versions by checkpoint. Examples of
// settled Blast frontend fees are Cetus tx 322AT4LYhWkGv5bKfjL9AALFsn1PsP22JAoKpGqoijgx
// (ConfirmSwapEventV3) and Aftermath tx 6ZX6bur8DAUd1jqY7KHTkWYAXUv84wmyYWxLMGuw4FrC
// (swap output split sent to Blast, mainnet test asset).
const cetus = "Blast frontend fees on Cetus";
const aftermath = "Blast frontend fees on Aftermath";
const requiredMetrics = ["fees", "revenue", "protocol_revenue", "supply_side_revenue"] as const;
type Metric = typeof requiredMetrics[number];

type Item = {
  component: string;
  coin_type: string;
  included_in_totals: boolean;
  underlying_venue_overlap: boolean;
  metrics: Partial<Record<Metric, unknown>>;
  evidence: { cetus_paid?: unknown; aftermath_paid?: unknown };
};

type Page = {
  schema_version: number;
  chain: string;
  network: string;
  deployment_fingerprint: string;
  methodology_version: string;
  date: string;
  start_timestamp: number;
  end_timestamp: number;
  snapshot_id: string;
  scope_coverage: Record<string, Partial<Record<Metric, { status: string }>>>;
  frontend_fee_coverage: { status: string };
  items: Item[];
  next_cursor: string | null;
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const start = Date.parse(`${options.dateString}T00:00:00Z`) / 1000;
  const cursorHistory = new Set<string>();
  const rows = new Set<string>();
  const url = new URL(endpoint);
  url.searchParams.set("date", options.dateString);
  let snapshotId: string | undefined;

  while (true) {
    const page: Page = await httpGet(url.toString(), {
      timeout: 15_000,
      maxRedirects: 0,
    });
    verifyPage(page, options.dateString, start, snapshotId);
    snapshotId = page.snapshot_id;

    for (const item of page.items) {
      if (!item.included_in_totals || item.underlying_venue_overlap) continue;
      const component = item.component;
      if (component !== "frontend_router_fees" && !Object.prototype.hasOwnProperty.call(sources, component)) {
        throw new Error(`Unrecognized Blast fee component ${component}`);
      }
      if (!coinType.test(item.coin_type)) throw new Error("Invalid Blast fee coin type");
      const token = item.coin_type === paddedSui ? "0x2::sui::SUI" : item.coin_type;
      const id = `${component}:${token}`;
      if (rows.has(id)) throw new Error("Duplicate Blast fee row");
      rows.add(id);

      const fees = atoms(item.metrics.fees);
      const revenue = atoms(item.metrics.revenue);
      const protocol = atoms(item.metrics.protocol_revenue);
      const supply = atoms(item.metrics.supply_side_revenue);
      if (fees !== revenue + supply || protocol > revenue) {
        throw new Error("Unreconciled Blast fee allocations");
      }

      if (component === "frontend_router_fees") {
        const cetusPaid = atoms(item.evidence.cetus_paid ?? "0");
        const aftermathPaid = atoms(item.evidence.aftermath_paid ?? "0");
        if (fees !== cetusPaid + aftermathPaid || revenue !== fees || protocol !== fees) {
          throw new Error("Unreconciled Blast frontend fee breakdown");
        }
        for (const [label, amount] of [[cetus, cetusPaid], [aftermath, aftermathPaid]] as const) {
          if (amount === 0n) continue;
          dailyFees.add(token, amount.toString(), label);
          dailyRevenue.add(token, amount.toString(), label);
          dailyProtocolRevenue.add(token, amount.toString(), label);
        }
        continue;
      }

      const label = sources[component as keyof typeof sources];
      if (fees) dailyFees.add(token, fees.toString(), label);
      if (revenue) dailyRevenue.add(token, revenue.toString(), label);
      if (protocol) dailyProtocolRevenue.add(token, protocol.toString(), label);
      if (supply) dailySupplySideRevenue.add(token, supply.toString(), label);
    }

    const cursor = page.next_cursor;
    if (cursor === null) break;
    if (!/^[a-zA-Z0-9_-]{1,512}$/.test(cursor) || cursorHistory.has(cursor) || cursorHistory.size >= 10_000) {
      throw new Error("Invalid Blast snapshot pagination");
    }
    cursorHistory.add(cursor);
    url.searchParams.set("cursor", cursor);
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

function verifyPage(page: Page, date: string, start: number, snapshotId?: string) {
  if (page?.schema_version !== 1 || page.chain !== CHAIN.SUI || page.network !== "mainnet" ||
    page.deployment_fingerprint !== fingerprint || page.methodology_version !== "blast-defi-v4" ||
    page.date !== date || page.start_timestamp !== start || page.end_timestamp !== start + 86_400 ||
    !/^[0-9a-f]{64}$/.test(page.snapshot_id) || (snapshotId && page.snapshot_id !== snapshotId) ||
    !Array.isArray(page.items) || page.items.length > 100 ||
    (page.next_cursor !== null && typeof page.next_cursor !== "string")) {
    throw new Error("Invalid Blast daily snapshot");
  }
  if (page.frontend_fee_coverage?.status !== "complete" ||
    !["launchpad", "frontend_router"].every(scope =>
      requiredMetrics.every(metric => page.scope_coverage?.[scope]?.[metric]?.status === "complete"))) {
    throw new Error("Blast daily fee and revenue coverage is incomplete");
  }
}

function atoms(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Invalid Blast fee amount");
  }
  return BigInt(value);
}

const feeBreakdown = {
  [sources.creation]: "Fees paid to create Blast launches.",
  [sources.curve_swaps]: "Fees paid on swaps against Blast bonding curves.",
  [sources.migration]: "Fees charged when Blast launches graduate to an external pool.",
  [sources.presale_raise]: "Fees charged on proceeds from Blast presales.",
  [cetus]: "The settled frontend fee paid to Blast on Cetus routes, excluding Cetus pool fees.",
  [aftermath]: "The settled frontend fee paid to Blast on Aftermath routes, excluding Aftermath DEX and DAO fees.",
};

const adapter: SimpleAdapter = {
  version: 1, // The receipt-backed API publishes complete UTC days.
  chains: [CHAIN.SUI],
  start: "2026-11-07",
  fetch,
  methodology: {
    Fees: "Blast launch creation, curve, migration and presale fees plus settled Blast frontend fees on Cetus and Aftermath. Excludes DEX fees and underlying vault LP yield.",
    UserFees: "Charges paid by users to create, trade, migrate or fund Blast launches and to swap through the Blast frontend.",
    Revenue: "Blast launch and frontend fees after deducting creator and partner shares.",
    ProtocolRevenue: "Blast launch fees retained by the protocol and settled frontend fees paid to Blast.",
    SupplySideRevenue: "Shares of Blast launch fees owed to creators and partners.",
  },
  breakdownMethodology: {
    Fees: feeBreakdown,
    UserFees: feeBreakdown,
    Revenue: {
      ...feeBreakdown,
      [sources.creation]: "Creation fees retained by Blast.",
      [sources.curve_swaps]: "Blast's share of bonding curve swap fees after creator and partner allocations.",
      [sources.migration]: "Migration fees retained by Blast after applicable allocations.",
      [sources.presale_raise]: "Presale raise fees retained by Blast after applicable allocations.",
    },
    ProtocolRevenue: {
      ...feeBreakdown,
      [sources.creation]: "Creation fees retained by the Blast protocol.",
      [sources.curve_swaps]: "The protocol share of Blast bonding curve swap fees.",
      [sources.migration]: "The protocol share of Blast launch migration fees.",
      [sources.presale_raise]: "The protocol share of Blast presale raise fees.",
    },
    SupplySideRevenue: {
      [sources.creation]: "The creator or partner share of Blast launch creation fees.",
      [sources.curve_swaps]: "The creator and partner shares of Blast bonding curve swap fees.",
      [sources.migration]: "The creator or partner share of Blast launch migration fees.",
      [sources.presale_raise]: "The creator or partner share of Blast presale raise fees.",
    },
  },
};

export default adapter;
