import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 5_000;

type ChainConfig = {
  chainName: string;
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

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.STELLAR]: {
    chainName: "Stellar",
    liquidationsExportPath: "/integrations/lending/stellar/liquidations",
    // Mainnet contracts were deployed at ledger 64140891,
    // 2026-08-27T00:55Z. An earlier start only backfills zeros.
    start: "2026-08-27",
  },

  // Add MultiversX later with the same API response shape:
  // [CHAIN.MULTIVERSX]: {
  //   chainName: "MultiversX",
  //   liquidationsExportPath: "/integrations/lending/multiversx/liquidations",
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

  // Collateral seized from liquidated borrowers (USD), summed over the day.
  const dailyCollateralLiquidated = sumField(points, "seizedUsd");

  return { dailyCollateralLiquidated };
}

const methodology = {
  CollateralLiquidated:
    "USD value of collateral seized from liquidated XOXNO lending borrowers, from the on-chain liquidation event feed (position:liquidation), summed per day across markets.",
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
