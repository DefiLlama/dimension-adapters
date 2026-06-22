import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_BASE = process.env.XOXNO_LENDING_API_BASE || "https://api.xoxno.com";
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

function getApiUrl(config: ChainConfig, startTime: string, endTime: string) {
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${config.revenueExportPath}?startTime=${startTime}&endTime=${endTime}`;
}

function sumField(points: RevenuePoint[], field: keyof RevenuePoint) {
  return points.reduce((sum, point) => sum + Number(point[field] ?? 0), 0);
}

function makeFetchFees(config: ChainConfig) {
  return async ({ startTimestamp }: FetchOptions) => {
    const { startTime, endTime } = dayRange(startTimestamp);
    const response = await fetch(getApiUrl(config, startTime, endTime), {
      headers: HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `XOXNO ${config.chainName} lending revenue export failed: ${response.status}`,
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

const breakdownMethodology = {
  InterestRevenue:
    "Daily interest revenue is the protocol revenue delta after subtracting explicit strategy and flash-loan fee sources in the XOXNO export.",
  StrategyFees:
    "Strategy fee revenue is derived from explicit lending strategy fee activity indexed by XOXNO.",
  FlashLoanFees:
    "Flash-loan fee revenue is derived from explicit lending flash-loan activity indexed by XOXNO.",
};

const adapter: SimpleAdapter & { pullHourly: boolean } = {
  version: 2,
  pullHourly: false,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_CONFIGS).map(([chain, config]) => [
      chain,
      {
        fetch: makeFetchFees(config),
        start: config.start,
        meta: { methodology, breakdownMethodology } as any,
      },
    ]),
  ),
};

export default adapter;
