import fetchURL from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";

const DEFAULT_API_BASE = "https://lunar-backend-production.up.railway.app";

function normalizeApiBase(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/** Override via env when deploying adapter tests or production indexers */
export const LUNAR_API_BASE = normalizeApiBase(
  process.env.LUNAR_ANALYTICS_API?.trim() ||
    process.env.LUNAR_API_BASE?.trim() ||
    DEFAULT_API_BASE,
);

/**
 * DefiLlama CHAIN slug → Lunar backend `chain` query param.
 * Source: Lunar backend analytics API chain-ID mapping
 * (`/api/analytics/*` — filters `source_chain_id` / `target_chain_id`).
 * Values are strings to preserve precision for large/non-EVM IDs (e.g. Sui).
 */
export const LUNAR_CHAIN_ID: Record<string, string> = {
  ethereum: "1",
  arbitrum: "42161",
  optimism: "10",
  polygon: "137",
  base: "8453",
  bsc: "56",
  avax: "43114",
  solana: "792703809",
  eclipse: "9286185",
  sui: "9270000000000000",
  aptos: "4157",
  ton: "-239",
  tron: "7281264288",
  near: "397",
  starknet: "9001",
  cardano: "9002",
  bitcoin: "-1000",
  sei: "1329",
  linea: "59144",
  scroll: "534352",
  mantle: "5000",
  blast: "81457",
  mode: "34443",
  era: "324",
  polygon_zkevm: "1101",
  celo: "42220",
  xdai: "100",
  fantom: "250",
  moonbeam: "1284",
  cronos: "25",
  metis: "1088",
  boba: "288",
  harmony: "1666600000",
  moonriver: "1285",
  kava: "2222",
  fuse: "122",
  okexchain: "66",
  aurora: "1313161554",
  canto: "7700",
  telos: "40",
  klaytn: "8217",
  manta: "169",
  op_bnb: "204",
  berachain: "80094",
  sonic: "146",
  hyperliquid: "999",
  unichain: "130",
  monad: "143",
  megaeth: "4326",
  plasma: "9745",
  ink: "57073",
  corn: "21000000",
  gravity: "1625",
  lisk: "1135",
  abstract: "2741",
  soneium: "1868",
  taiko: "167000",
  fraxtal: "252",
  kroma: "255",
  zora: "7777777",
  merlin: "4200",
  btr: "200901",
  bouncebit: "6001",
  rsk: "30",
  flare: "14",
  etlk: "42793",
  xlayer: "196",
  bob: "60808",
  hemi: "43111",
  sty: "1514",
  injective: "1776",
  osmosis: "1777",
  neutron: "1778",
  celestia: "1779",
};

export const LUNAR_SUPPORTED_CHAINS = Object.keys(LUNAR_CHAIN_ID);

export const LUNAR_DEFAULT_START = "2024-01-01";

type BalanceField = { usd?: string | number } | undefined;

export interface LunarAnalyticsEnvelope {
  success?: boolean;
  data?: Record<string, BalanceField>;
}

/** Backend stores USD in 1e18-scaled integer strings under `.usd` */
export function parseLunarUsdWei(field: BalanceField): number {
  if (!field?.usd) return 0;
  const raw = typeof field.usd === "string" ? field.usd : String(field.usd);
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 1e18;
}

export async function fetchLunarAnalytics(
  path: "dexs" | "bridge" | "sweeper",
  options: FetchOptions,
): Promise<LunarAnalyticsEnvelope> {
  const chainId = LUNAR_CHAIN_ID[options.chain];
  const params = new URLSearchParams({
    startTimestamp: String(options.startTimestamp),
    endTimestamp: String(options.endTimestamp),
  });
  if (chainId !== undefined) params.set("chain", chainId);

  const url = `${LUNAR_API_BASE}/api/analytics/${path}?${params.toString()}`;
  const res = (await fetchURL(url)) as LunarAnalyticsEnvelope;
  if (res?.success === false) {
    throw new Error(
      `Lunar analytics API returned success=false for ${path} (${options.chain})`,
    );
  }
  if (!res?.data) {
    throw new Error(
      `Lunar analytics API missing data for ${path} (${options.chain})`,
    );
  }
  return res;
}
