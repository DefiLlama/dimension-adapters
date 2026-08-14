import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 5_000;

type ChainConfig = {
  chainName: string;
  revenueExportPath: string;
  start: string;
};

type RevenuePoint = {
  dailyFeesUsd?: number;
  dailyRevenueUsd?: number;
  dailyProtocolRevenueUsd?: number;
  dailySupplySideRevenueUsd?: number;
};

type RevenueExport = {
  points?: RevenuePoint[];
};

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.STELLAR]: {
    chainName: "Stellar",
    revenueExportPath: "/integrations/lending/stellar/revenue",
    start: "2026-06-21",
  },

  // Add MultiversX later with the same API response shape:
  // [CHAIN.MULTIVERSX]: {
  //   chainName: "MultiversX",
  //   revenueExportPath: "/integrations/lending/multiversx/revenue",
  //   start: "YYYY-MM-DD",
  // },
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

function sumField(points: RevenuePoint[], field: keyof RevenuePoint) {
  return points.reduce((sum, point) => sum + Number(point[field] ?? 0), 0);
}

async function makeFetchFees(options: FetchOptions) {
    const { startTime, endTime } = dayRange(options.startTimestamp);
    const path = CHAIN_CONFIGS[options.chain].revenueExportPath
    const url = `${API_BASE}${path}?startTime=${startTime}&endTime=${endTime}`
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `XOXNO lending revenue export failed: ${response.status}`,
      );
    }

    const data = (await response.json()) as RevenueExport;
    const points = Array.isArray(data.points) ? data.points : [];
    const dailyFees = sumField(points, "dailyFeesUsd");
    const dailyRevenue = sumField(points, "dailyRevenueUsd");
    const dailyProtocolRevenue = sumField(points, "dailyProtocolRevenueUsd");
    const dailySupplySideRevenue = sumField(
      points,
      "dailySupplySideRevenueUsd",
    );

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

const methodology = {
  Fees:
    "Borrower-paid interest and explicit lending fees derived from daily protocol revenue deltas.",
  Revenue:
    "Protocol revenue is the positive daily delta of cumulative on-chain pool protocol_revenue(asset), summed across markets.",
  ProtocolRevenue:
    "Same as revenue for the current XOXNO lending export.",
  SupplySideRevenue:
    "Reported as 0 until supplier-side interest revenue is exported separately.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: makeFetchFees,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_CONFIGS).map(([chain, config]) => [
      chain,
      { start: config.start },
    ]),
  ),
  methodology,
};

export default adapter;
