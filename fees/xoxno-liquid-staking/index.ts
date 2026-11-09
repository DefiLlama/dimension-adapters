import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 10_000;
const REVENUE_EXPORT_PATH = "/integrations/liquid-staking/multiversx/revenue";

type RevenuePoint = {
  dailyFeesUsd?: number;
  dailyRevenueUsd?: number;
  dailyProtocolRevenueUsd?: number;
  dailySupplySideRevenueUsd?: number;
};

type RevenueExport = { points?: RevenuePoint[] };

function dayRange(timestamp: number) {
  const day = new Date(timestamp * 1000);
  day.setUTCHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    startTime: day.toISOString().slice(0, 10),
    endTime: next.toISOString().slice(0, 10),
  };
}

function sumField(points: RevenuePoint[], field: keyof RevenuePoint): number {
  return points.reduce((sum, point) => sum + Number(point[field] ?? 0), 0);
}

const fetch_ = async (options: FetchOptions) => {
  const { startTime, endTime } = dayRange(options.startTimestamp);
  const url = `${API_BASE}${REVENUE_EXPORT_PATH}?startTime=${startTime}&endTime=${endTime}`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `XOXNO liquid staking revenue export failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as RevenueExport;
  const points = Array.isArray(data.points) ? data.points : [];

  // Both sides are emitted on chain: claimRewards carries the gross staking
  // reward and protocolRevenue carries the protocol's cut, so nothing here is
  // derived from an assumed fee rate.
  const out: Record<string, ReturnType<typeof options.createBalances>> = {};
  for (const [key, field] of [
    ["dailyFees", "dailyFeesUsd"],
    ["dailyRevenue", "dailyRevenueUsd"],
    ["dailyProtocolRevenue", "dailyProtocolRevenueUsd"],
    ["dailySupplySideRevenue", "dailySupplySideRevenueUsd"],
  ] as const) {
    out[key] = options.createBalances();
    out[key].addUSDValue(sumField(points, field), METRIC.ASSETS_YIELDS);
  }
  return out;
};

const methodology = {
  Fees: "Staking rewards earned by the EGLD delegated through XOXNO Liquid Staking.",
  Revenue: "The 7% commission XOXNO takes on those staking rewards.",
  ProtocolRevenue: "Same as Revenue; the commission accrues to the treasury.",
  SupplySideRevenue:
    "Staking rewards retained by xEGLD holders, realised through the exchange rate rather than distributed.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]:
      "Gross EGLD staking rewards accruing to the pool, before the protocol commission.",
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]:
      "The protocol commission on staking rewards, emitted on chain as its own event rather than derived from a rate.",
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: "The protocol commission on staking rewards.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]:
      "Staking rewards net of commission, accruing to xEGLD holders through the exchange rate.",
  },
};

const adapter: SimpleAdapter = {
  // External API returning daily aggregates only.
  version: 1,
  fetch: fetch_,
  // Protocol genesis. The first reward events land the next day, so this
  // backfills one zero day rather than starting mid-history.
  adapter: { [CHAIN.ELROND]: { start: "2025-01-03" } },
  methodology,
  breakdownMethodology,
};

export default adapter;
