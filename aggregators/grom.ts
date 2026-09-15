/**
 * DefiLlama aggregators adapter — GROM Instant Swap.
 *
 * Data source: GROM confirmed-fill ledger (read-only HTTP), not public RPC getLogs.
 *   GET https://grom.exchange/api/public/dimensions
 *       ?product=swap&integrator=grom-exchange&chainKey=&startTimestamp=&endTimestamp=
 *
 * Fail closed: requires ok===true, finite non-negative metrics, exact
 * chainKey string, matching window, and coverage.status==="ready".
 * Never treat missing/null/boolean/array/whitespace as zero.
 *
 * Methodology: Instant Swap volume attributed via LiFi integrator only.
 * Other GROM routers are out of scope until indexed.
 *
 * Helper lives in helpers/aggregators/grom.ts — do not put helpers under
 * aggregators/ (CI treats every file there as a runnable adapter).
 */
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { assertOkDimensionsResponse } from "../helpers/aggregators/grom";

const API = "https://grom.exchange/api/public/dimensions";
/** LiFi integrator id — ledger is already scoped to this; query documents attribution. */
const INTEGRATOR = "grom-exchange";
/** Earliest UTC day a GROM index window may begin (not proof every chain is covered). */
const START = "2026-08-22";
const DAY = 86400;

const CHAIN_KEYS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.OPTIMISM]: "optimism",
  [CHAIN.BSC]: "bsc",
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.AVAX]: "avax",
  [CHAIN.BASE]: "base",
};

/** Map harness/backfill windows onto completed UTC calendar days (GROM ledger unit). */
function utcDayWindow(startTimestamp: number, endTimestamp: number): { start: number; end: number } {
  const start = Math.floor(Number(startTimestamp) / DAY) * DAY;
  let end = Math.floor(Number(endTimestamp) / DAY) * DAY;
  if (!(end > start)) end = start + DAY;
  return { start, end };
}

async function fetchDimensions(
  options: FetchOptions,
  chainKey: string
): Promise<{ dailyVolume: ReturnType<FetchOptions["createBalances"]>; dailyFees: ReturnType<FetchOptions["createBalances"]> }> {
  const { start, end } = utcDayWindow(options.startTimestamp, options.endTimestamp);
  const url =
    `${API}?product=swap` +
    `&integrator=${encodeURIComponent(INTEGRATOR)}` +
    `&chainKey=${encodeURIComponent(chainKey)}` +
    `&startTimestamp=${start}` +
    `&endTimestamp=${end}`;

  let data: unknown;
  try {
    data = await fetchURL(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `grom aggregator: upstream fetch failed for ${chainKey} [${start},${end}): ${message}`
    );
  }

  const { volume, fees } = assertOkDimensionsResponse(data, {
    chainKey,
    startTimestamp: start,
    endTimestamp: end,
  });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees);
  return { dailyVolume, dailyFees };
}

function makeFetch(chainKey: string) {
  return async (options: FetchOptions) => fetchDimensions(options, chainKey);
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_KEYS).map(([chain, key]) => [
      chain,
      {
        fetch: makeFetch(key),
        start: START,
      },
    ])
  ),
  methodology: {
    Volume:
      "GROM Instant Swap executions confirmed in the GROM fill ledger for the requested chain and half-open UTC window with persisted LiFi-integrator index coverage. Partner/venue global volume and other GROM routers (e.g. CoWSwap xStocks) are never assigned to GROM here. Tokenized-stock swaps that settle via Instant Swap / LiFi rails are included once under swap.",
    Fees:
      "Actual GROM fee receipts recorded on those confirmed LiFi-attributed fills for that covered chain/window. Fee-wallet transfers alone are not treated as swap volume.",
  },
};

export default adapter;
