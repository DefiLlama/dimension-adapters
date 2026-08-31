import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import fetchURL from "../utils/fetchURL";

const API = "https://rebates.ophis.fi/defillama";
export const OPHIS_START = "2026-05-14";

// Canonical reporting-chain list and IDs:
// https://github.com/ophis-fi/ophis/blob/main/apps/rebate-indexer/src/scan/chains.ts
export const ophisChainConfig: Record<string, { id: number; start: string }> = {
  [CHAIN.ETHEREUM]: { id: 1, start: OPHIS_START },
  [CHAIN.OPTIMISM]: { id: 10, start: OPHIS_START },
  [CHAIN.BSC]: { id: 56, start: OPHIS_START },
  [CHAIN.XDAI]: { id: 100, start: OPHIS_START },
  [CHAIN.UNICHAIN]: { id: 130, start: OPHIS_START },
  [CHAIN.POLYGON]: { id: 137, start: OPHIS_START },
  [CHAIN.ROBINHOOD]: { id: 4663, start: OPHIS_START },
  [CHAIN.BASE]: { id: 8453, start: OPHIS_START },
  [CHAIN.PLASMA]: { id: 9745, start: OPHIS_START },
  [CHAIN.ARBITRUM]: { id: 42161, start: OPHIS_START },
  [CHAIN.AVAX]: { id: 43114, start: OPHIS_START },
  [CHAIN.INK]: { id: 57073, start: OPHIS_START },
  [CHAIN.LINEA]: { id: 59144, start: OPHIS_START },
};

export interface OphisChainDay {
  chainId: number;
  volumeUsd: number;
  feesUsd: number;
  revenueUsd: number;
  supplySideRevenueUsd: number;
  trades: number;
  transactions: number;
  users: number;
}

export type OphisProtocolDay = Omit<OphisChainDay, "chainId">;

interface OphisDayResponse {
  ok: true;
  date: string;
  totals: OphisProtocolDay;
  chains: OphisChainDay[];
}

const responseCache = new Map<string, Promise<OphisDayResponse>>();
const supportedChainIds = new Set(Object.values(ophisChainConfig).map(({ id }) => id));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  isNonNegativeFinite(value) && Number.isInteger(value);

const validateChainDay = (value: unknown, date: string): OphisChainDay => {
  if (!isRecord(value) || !isNonNegativeInteger(value.chainId))
    throw new Error(`ophis: invalid chain row for ${date}`);

  const usdFields = ["volumeUsd", "feesUsd", "revenueUsd", "supplySideRevenueUsd"] as const;
  const countFields = ["trades", "transactions", "users"] as const;
  for (const field of usdFields)
    if (!isNonNegativeFinite(value[field]))
      throw new Error(`ophis: invalid ${field} for chain ${value.chainId} on ${date}`);
  for (const field of countFields)
    if (!isNonNegativeInteger(value[field]))
      throw new Error(`ophis: invalid ${field} for chain ${value.chainId} on ${date}`);

  const row = value as unknown as OphisChainDay;
  if (row.transactions > row.trades || row.users > row.trades)
    throw new Error(`ophis: inconsistent activity counts for chain ${row.chainId} on ${date}`);

  // Accommodate only JSON floating-point rounding, not an accounting mismatch.
  const feeTolerance = Math.max(1e-9, row.feesUsd * 1e-12);
  if (Math.abs(row.feesUsd - row.revenueUsd - row.supplySideRevenueUsd) > feeTolerance)
    throw new Error(`ophis: unbalanced fee split for chain ${row.chainId} on ${date}`);

  return row;
};

const validateProtocolDay = (value: unknown, date: string): OphisProtocolDay => {
  if (!isRecord(value)) throw new Error(`ophis: invalid protocol totals for ${date}`);

  const usdFields = ["volumeUsd", "feesUsd", "revenueUsd", "supplySideRevenueUsd"] as const;
  const countFields = ["trades", "transactions", "users"] as const;
  for (const field of usdFields)
    if (!isNonNegativeFinite(value[field]))
      throw new Error(`ophis: invalid protocol ${field} for ${date}`);
  for (const field of countFields)
    if (!isNonNegativeInteger(value[field]))
      throw new Error(`ophis: invalid protocol ${field} for ${date}`);

  const totals = value as unknown as OphisProtocolDay;
  if (totals.transactions > totals.trades || totals.users > totals.trades)
    throw new Error(`ophis: inconsistent protocol activity counts for ${date}`);

  const feeTolerance = Math.max(1e-9, totals.feesUsd * 1e-12);
  if (Math.abs(totals.feesUsd - totals.revenueUsd - totals.supplySideRevenueUsd) > feeTolerance)
    throw new Error(`ophis: unbalanced protocol fee split for ${date}`);

  return totals;
};

const fetchOphisDay = (date: string): Promise<OphisDayResponse> => {
  const cached = responseCache.get(date);
  if (cached) return cached;

  const pending = (async () => {
    const response: unknown = await fetchURL(`${API}?date=${encodeURIComponent(date)}`);
    if (!isRecord(response) || response.ok !== true || response.date !== date || !Array.isArray(response.chains))
      throw new Error(`ophis: incomplete reporting response for ${date}`);

    const totals = validateProtocolDay(response.totals, date);
    const chains = response.chains.map((row) => validateChainDay(row, date));
    const returnedChainIds = new Set<number>();
    for (const row of chains) {
      if (!supportedChainIds.has(row.chainId))
        throw new Error(`ophis: unsupported chain ${row.chainId} returned for ${date}`);
      if (returnedChainIds.has(row.chainId))
        throw new Error(`ophis: duplicate chain ${row.chainId} returned for ${date}`);
      returnedChainIds.add(row.chainId);
    }

    const additiveUsdFields = ["volumeUsd", "feesUsd", "revenueUsd", "supplySideRevenueUsd"] as const;
    for (const field of additiveUsdFields) {
      const chainSum = chains.reduce((sum, row) => sum + row[field], 0);
      const tolerance = Math.max(1e-9, Math.abs(totals[field]) * 1e-12);
      if (Math.abs(totals[field] - chainSum) > tolerance)
        throw new Error(`ophis: protocol ${field} does not match chain sum for ${date}`);
    }
    for (const field of ["trades", "transactions"] as const) {
      const chainSum = chains.reduce((sum, row) => sum + row[field], 0);
      if (totals[field] !== chainSum)
        throw new Error(`ophis: protocol ${field} does not match chain sum for ${date}`);
    }
    const maxChainUsers = chains.reduce((max, row) => Math.max(max, row.users), 0);
    const summedChainUsers = chains.reduce((sum, row) => sum + row.users, 0);
    if (totals.users < maxChainUsers || totals.users > summedChainUsers)
      throw new Error(`ophis: invalid cross-chain user total for ${date}`);

    return { ok: true as const, date, totals, chains };
  })();

  responseCache.set(date, pending);
  pending.catch(() => {
    if (responseCache.get(date) === pending) responseCache.delete(date);
  });
  return pending;
};

/**
 * Fetches and validates Ophis reporting data for one day and chain.
 * `options.chain` must be one of the keys in {@link ophisChainConfig}.
 *
 * @returns The validated chain row, or `undefined` when a valid response has no
 * activity row for the requested chain.
 * @throws If the chain is unsupported or the API response is stale, malformed,
 * duplicated, incomplete, or internally inconsistent.
 */
export const fetchOphisChainDay = async (options: FetchOptions): Promise<OphisChainDay | undefined> => {
  const config = ophisChainConfig[options.chain];
  if (!config) throw new Error(`ophis: unsupported DefiLlama chain ${options.chain}`);
  const response = await fetchOphisDay(options.dateString);
  return response.chains.find(({ chainId }) => chainId === config.id);
};

/** Fetches the validated protocol-wide totals, including cross-chain user deduplication. */
export const fetchOphisProtocolDay = async (options: FetchOptions): Promise<OphisProtocolDay> =>
  (await fetchOphisDay(options.dateString)).totals;
