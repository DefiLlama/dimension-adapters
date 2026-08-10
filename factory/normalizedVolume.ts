import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";
import { getEnv } from "../helpers/env";
import { httpGet } from "../utils/fetchURL";

const PERP_SEGMENTS = ['linear_perp', 'inverse_perp'];
const LIVE_RUN_LAG = 12 * 60 * 60;
const MAX_SNAPSHOT_AGE = 24 * 60 * 60;

const asDate = (timestamp?: number) => timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : 'n/a';

async function get(slug: string, file: string, { allow404 = false } = {}) {
  const apiKey = getEnv('INTERNAL_API_KEY');
  const base = getEnv('MARKETS_API');
  if (!apiKey || !base) throw new Error('INTERNAL_API_KEY and MARKETS_API must be set');
  return httpGet(`${base.replace('{key}', apiKey)}/${slug}/${file}`).catch((e: any) => {
    const message = String(e?.message ?? 'request failed').split(apiKey).join('<key>');
    if (allow404 && (e?.axiosError === 'Not found' || message.includes('404'))) return null;
    throw new Error(`${slug}: ${file} - ${message}`);
  });
}

async function fromHistory(slug: string, startOfDay: number) {
  const data = await get(slug, 'series/all.json', { allow404: true });
  if (!data) return { day: null, coverage: 'no history file' };

  const { first_day, last_day, stale } = data.freshness ?? {};
  const coverage = `history covers ${asDate(first_day)}..${asDate(last_day)}${stale ? ' (stale)' : ''}`;

  const dayIndex = (data.days ?? []).indexOf(startOfDay);
  if (dayIndex === -1) return { day: null, coverage };

  const sumSegments = (metric: string) => {
    let total: number | null = null;
    for (const segment of PERP_SEGMENTS) {
      const value = data.series[data.key.indexOf(`${segment}_${metric}`)]?.[dayIndex];
      if (typeof value === 'number') total = (total ?? 0) + value;
    }
    return total;
  };

  const dailyNormalizedVolume = sumSegments('normalized_volume');
  if (dailyNormalizedVolume === null) return { day: null, coverage };
  return {
    day: { dailyNormalizedVolume, dailyActiveLiquidity: sumSegments('active_liquidity') ?? 0 },
    coverage,
  };
}

async function fromSnapshot(slug: string) {
  const data = await get(slug, 'index.json');

  const now = Math.trunc(Date.now() / 1000);
  for (const metric of ['volume', 'depth']) {
    const observedAt = data?.freshness?.[metric];
    const age = now - new Date(observedAt).getTime() / 1000;
    if (!Number.isFinite(age) || age > MAX_SNAPSHOT_AGE)
      throw new Error(`${slug}: stale snapshot, ${metric} last observed ${observedAt}`);
  }

  const pairs = PERP_SEGMENTS.flatMap((segment) => data?.segments?.[segment]?.pairs ?? []);
  if (!pairs.length) throw new Error(`${slug}: no perp markets in snapshot`);

  let dailyNormalizedVolume = 0;
  let dailyActiveLiquidity = 0;
  for (const { nvol } of pairs) {
    dailyNormalizedVolume += nvol?.normalized ?? 0;
    dailyActiveLiquidity += nvol?.active_liquidity ?? 0;
  }
  return { dailyNormalizedVolume, dailyActiveLiquidity };
}

function fetchNormalizedVolume(slug: string, version: 1 | 2) {
  return async ({ startOfDay, endTimestamp, dateString }: FetchOptions) => {
    const { day, coverage } = await fromHistory(slug, startOfDay);
    if (day) return day;

    const isLiveRun = Math.trunc(Date.now() / 1000) - endTimestamp < LIVE_RUN_LAG;
    if (version !== 2 || !isLiveRun)
      throw new Error(`${slug}: no settled history for ${dateString}, ${coverage}`);

    return fromSnapshot(slug);
  };
}

function normalizedVolumeAdapter(slug: string, chain: string, start: string, version: 1 | 2 = 1): SimpleAdapter {
  return {
    version,
    adapter: { [chain]: { fetch: fetchNormalizedVolume(slug, version), start } },
  };
}

const protocols = {
  'hyperliquid': normalizedVolumeAdapter('hyperliquid', CHAIN.HYPERLIQUID, '2026-01-20'),
  'edgex-v2': normalizedVolumeAdapter('edgex', CHAIN.EDGEX, '2026-01-20'),
  'lighter': normalizedVolumeAdapter('lighter', CHAIN.ZK_LIGHTER, '2026-01-20'),
  'aster': normalizedVolumeAdapter('aster', CHAIN.OFF_CHAIN, '2026-01-20'),
  'paradex': normalizedVolumeAdapter('paradex', CHAIN.PARADEX, '2026-01-20', 2),
  'sunx': normalizedVolumeAdapter('sunx', CHAIN.TRON, '2026-01-20'),
  'apex-omni': normalizedVolumeAdapter('apex-omni', CHAIN.ETHEREUM, '2026-01-20'),
  'grvt': normalizedVolumeAdapter('grvt', CHAIN.GRVT, '2026-01-20'),
  'pacifica': normalizedVolumeAdapter('pacifica', CHAIN.SOLANA, '2026-01-20', 2),
  'extended': normalizedVolumeAdapter('extended', CHAIN.STARKNET, '2026-01-20'),
  'nado': normalizedVolumeAdapter('nado', CHAIN.INK, '2026-01-20'),
  'standx': normalizedVolumeAdapter('standx', CHAIN.STANDX, '2026-01-20'),
  'evedex': normalizedVolumeAdapter('evedex', CHAIN.EVENTUM, '2026-03-30'),
  'antarctic': normalizedVolumeAdapter('antarctic', CHAIN.OFF_CHAIN, '2026-03-06'),
  'risex': normalizedVolumeAdapter('risex', CHAIN.RISE, '2026-05-25', 2),
  'dango': normalizedVolumeAdapter('dango', CHAIN.DANGO, '2026-05-28', 2),
  'sodex': normalizedVolumeAdapter('sodex', CHAIN.VALUECHAIN, '2026-05-31'),
  // 'edgeX': normalizedVolumeAdapter('edgex', CHAIN.EDGEX, '2026-05-28'),
  // 'orderly': normalizedVolumeAdapter('orderly', CHAIN.ORDERLY, '2026-05-28'),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);
