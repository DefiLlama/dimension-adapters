/**
 * DefiLlama aggregators adapter — GROM Instant Swap.
 *
 * Copy into https://github.com/DefiLlama/dimension-adapters as:
 *   aggregators/grom.ts
 *   aggregators/grom-guards.js
 *
 * Data source: GROM confirmed-fill ledger (read-only).
 *   GET https://grom.exchange/api/public/dimensions
 *       ?product=swap&chainKey=ethereum&startTimestamp=&endTimestamp=
 *
 * Fail closed: requires ok===true, finite non-negative metrics, exact
 * chainKey string, matching window, and coverage.status==="ready".
 * Never treat missing/null/boolean/array/whitespace as zero.
 *
 * Methodology: Instant Swap volume attributed via LiFi integrator only
 * (see ../METHODOLOGY.md). Other GROM routers are out of scope until indexed.
 */
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { assertOkDimensionsResponse } from "./grom-guards.js";

const API = "https://grom.exchange/api/public/dimensions";
/** Earliest UTC day a GROM index window may begin (not proof every chain is covered). */
const START = "2026-08-22";

const CHAIN_KEYS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.OPTIMISM]: "optimism",
  [CHAIN.BSC]: "bsc",
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.AVAX]: "avax",
  [CHAIN.BASE]: "base",
  [CHAIN.SOLANA]: "solana",
};

type DimensionsResponse = {
  ok?: boolean;
  dailyVolumeUsd?: number | null;
  dailyFeesUsd?: number | null;
  fillCount?: number | null;
  chainKey?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  coverage?: { status?: string };
  error?: string;
  code?: string;
};

async function fetchDimensions(
  options: FetchOptions,
  chainKey: string
): Promise<{ dailyVolume: ReturnType<FetchOptions["createBalances"]>; dailyFees: ReturnType<FetchOptions["createBalances"]> }> {
  const url =
    `${API}?product=swap` +
    `&chainKey=${encodeURIComponent(chainKey)}` +
    `&startTimestamp=${options.startTimestamp}` +
    `&endTimestamp=${options.endTimestamp}`;

  let data: DimensionsResponse;
  try {
    data = await fetchURL(url);
  } catch (err: any) {
    throw new Error(
      `grom aggregator: upstream fetch failed for ${chainKey} [${options.startTimestamp},${options.endTimestamp}): ${err?.message || err}`
    );
  }

  const { volume, fees } = assertOkDimensionsResponse(data, {
    chainKey,
    startTimestamp: options.startTimestamp,
    endTimestamp: options.endTimestamp,
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
