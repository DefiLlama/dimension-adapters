import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 5_000;

type ChainConfig = {
  liquidationsExportPath: string;
  start: string;
};

type LiquidationPoint = {
  seizedUsd?: number;
  repaidUsd?: number;
};

type LiquidationsExport = {
  points?: LiquidationPoint[];
};

// Both chains publish the same export contract, so the only per-chain
// difference is the path and the first-indexed-event date. DefiLlama
// lists MultiversX under its legacy key, CHAIN.ELROND.
// `start` is each chain's first day with data; an earlier date only
// backfills zeros.
const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.STELLAR]: {
    liquidationsExportPath: "/integrations/lending/stellar/liquidations",
    start: "2026-08-27",
  },
  [CHAIN.ELROND]: {
    liquidationsExportPath: "/integrations/lending/multiversx/liquidations",
    start: "2025-08-14",
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

function sumField(points: LiquidationPoint[], field: keyof LiquidationPoint) {
  return points.reduce((sum, point) => sum + Number(point[field] ?? 0), 0);
}

async function fetchLiquidations(options: FetchOptions) {
  const { startTime, endTime } = dayRange(options.startTimestamp);
  const path = CHAIN_CONFIGS[options.chain].liquidationsExportPath;
  const url = `${API_BASE}${path}?startTime=${startTime}&endTime=${endTime}&bin=1d`;
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `XOXNO lending liquidations export failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as LiquidationsExport;
  const points = Array.isArray(data.points) ? data.points : [];

  const dailyCollateralLiquidated = sumField(points, "seizedUsd");

  return { dailyCollateralLiquidated };
}

const methodology = {
  CollateralLiquidated:
    "Value of collateral seized from borrowers in liquidations.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetchLiquidations,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_CONFIGS).map(([chain, config]) => [
      chain,
      { start: config.start },
    ]),
  ),
  methodology,
};

export default adapter;
