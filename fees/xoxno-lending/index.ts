import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 10_000;

type RevenuePoint = {
  dailyFeesUsd?: number;
  dailyRevenueUsd?: number;
  dailyProtocolRevenueUsd?: number;
  dailySupplySideRevenueUsd?: number;
};

type RevenueExport = { points?: RevenuePoint[] };

type ChainConfig = { revenueExportPath: string; start: string };

// `start` is each chain's first day with data; an earlier date only
// backfills zeros.
const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.STELLAR]: {
    revenueExportPath: "/integrations/lending/stellar/revenue",
    start: "2026-08-27",
  },
  [CHAIN.ELROND]: {
    revenueExportPath: "/integrations/lending/multiversx/revenue",
    start: "2025-08-07",
  },
};

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
  const { revenueExportPath } = CHAIN_CONFIGS[options.chain];
  const url = `${API_BASE}${revenueExportPath}?startTime=${startTime}&endTime=${endTime}`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `XOXNO lending revenue export failed for ${options.chain}: ${response.status}`,
    );
  }

  const data = (await response.json()) as RevenueExport;
  const points = Array.isArray(data.points) ? data.points : [];

  const out: Record<string, ReturnType<typeof options.createBalances>> = {};
  for (const [key, field] of [
    ["dailyFees", "dailyFeesUsd"],
    ["dailyRevenue", "dailyRevenueUsd"],
    ["dailyProtocolRevenue", "dailyProtocolRevenueUsd"],
    ["dailySupplySideRevenue", "dailySupplySideRevenueUsd"],
  ] as const) {
    out[key] = options.createBalances();
    out[key].addUSDValue(sumField(points, field), METRIC.BORROW_INTEREST);
  }
  return out;
};

const methodology = {
  Fees: "All interest paid by borrowers, plus flash-loan, strategy (leverage) and liquidation fees.",
  Revenue:
    "The protocol's share: the reserve-factor cut of borrow interest, plus 100% of flash-loan, strategy and liquidation fees.",
  ProtocolRevenue:
    "Same as Revenue. All protocol revenue is minted as supply shares owned by the protocol and swept to the treasury on claim.",
  SupplySideRevenue:
    "Interest distributed to suppliers: borrow interest net of the reserve factor.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      "Gross interest paid by borrowers across every market, plus flash-loan, strategy (leverage) and liquidation fees.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]:
      "The reserve-factor share of borrow interest plus 100% of flash-loan, strategy and liquidation fees.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]:
      "The reserve-factor share of borrow interest plus 100% of flash-loan, strategy and liquidation fees.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]:
      "Borrow interest net of the reserve factor, accrued to suppliers through the supply index.",
  },
};

const adapter: SimpleAdapter = {
  // External API returning daily aggregates only; v2 block-range fetching is
  // not possible against it.
  version: 1,
  fetch: fetch_,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_CONFIGS).map(([chain, config]) => [
      chain,
      { start: config.start },
    ]),
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
