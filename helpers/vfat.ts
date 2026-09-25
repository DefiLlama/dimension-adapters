import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import fetchURL from "../utils/fetchURL";

// vfat daily user metrics per chain and UTC day, rebuilt from indexed Sickle deploys and actions.
// A user is a Sickle owner wallet (the admin set once at Sickle deploy).
// A day before the chain's `first_day` is a 404 and a metric not yet available is null;
// both throw here rather than being stored as 0.
const API = "https://info-api.vf.at/daily-users";

// First day both Sickle action sources are indexed; active users read null before it.
export const VFAT_ACTIVITY_FROM = "2024-11-01";

// Chains in the API scope (`scope_chain_ids` of an all-chain response).
// `firstDay` is the chain's first Sickle deploy (the API's `first_day`).
export const vfatChainConfig: Record<string, { chainId: number; firstDay: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, firstDay: "2023-01-05" },
  [CHAIN.OPTIMISM]: { chainId: 10, firstDay: "2023-12-05" },
  [CHAIN.CRONOS]: { chainId: 25, firstDay: "2025-09-18" },
  [CHAIN.BSC]: { chainId: 56, firstDay: "2023-01-02" },
  [CHAIN.UNICHAIN]: { chainId: 130, firstDay: "2025-03-11" },
  [CHAIN.POLYGON]: { chainId: 137, firstDay: "2022-12-30" },
  [CHAIN.MONAD]: { chainId: 143, firstDay: "2025-11-25" },
  [CHAIN.SONIC]: { chainId: 146, firstDay: "2024-12-26" },
  [CHAIN.FRAXTAL]: { chainId: 252, firstDay: "2024-12-04" },
  [CHAIN.PULSECHAIN]: { chainId: 369, firstDay: "2023-01-05" },
  [CHAIN.WC]: { chainId: 480, firstDay: "2025-10-07" },
  [CHAIN.BOT_CHAIN]: { chainId: 677, firstDay: "2026-08-26" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, firstDay: "2025-05-26" },
  [CHAIN.LISK]: { chainId: 1135, firstDay: "2025-06-13" },
  [CHAIN.METAL]: { chainId: 1750, firstDay: "2025-06-13" },
  [CHAIN.SONEIUM]: { chainId: 1868, firstDay: "2025-06-13" },
  [CHAIN.PEAQ]: { chainId: 3338, firstDay: "2026-06-11" },
  [CHAIN.TEMPO]: { chainId: 4217, firstDay: "2026-08-21" },
  [CHAIN.MEGAETH]: { chainId: 4326, firstDay: "2026-04-04" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, firstDay: "2026-07-11" },
  [CHAIN.MANTLE]: { chainId: 5000, firstDay: "2024-01-22" },
  [CHAIN.ARC]: { chainId: 5042, firstDay: "2026-09-16" },
  [CHAIN.ZETA]: { chainId: 7000, firstDay: "2025-08-15" },
  [CHAIN.BASE]: { chainId: 8453, firstDay: "2023-09-21" },
  [CHAIN.PLASMA]: { chainId: 9745, firstDay: "2025-09-26" },
  [CHAIN.MODE]: { chainId: 34443, firstDay: "2024-05-16" },
  [CHAIN.ARBITRUM]: { chainId: 42161, firstDay: "2023-06-02" },
  [CHAIN.CELO]: { chainId: 42220, firstDay: "2025-08-09" },
  [CHAIN.ETHERLINK]: { chainId: 42793, firstDay: "2025-10-28" },
  [CHAIN.HEMI]: { chainId: 43111, firstDay: "2025-05-10" },
  [CHAIN.AVAX]: { chainId: 43114, firstDay: "2023-05-31" },
  [CHAIN.INK]: { chainId: 57073, firstDay: "2025-02-28" },
  [CHAIN.LINEA]: { chainId: 59144, firstDay: "2024-05-10" },
  [CHAIN.BERACHAIN]: { chainId: 80094, firstDay: "2025-02-20" },
  [CHAIN.SCROLL]: { chainId: 534352, firstDay: "2024-10-09" },
  [CHAIN.KATANA]: { chainId: 747474, firstDay: "2025-07-10" },
};

export async function fetchVfatDailyUsers(options: FetchOptions, metric: "active_users" | "new_users"): Promise<number> {
  const { chainId } = vfatChainConfig[options.chain];
  const date = options.dateString;
  // The API also serves the running total of the current UTC day; only a finished day is final.
  if (options.endTimestamp > Date.now() / 1000) throw new Error(`vfat: ${date} has not ended yet`);
  const res = await fetchURL(`${API}?chainId=${chainId}&startDate=${date}&endDate=${date}`);
  if (res?.chain_id !== chainId) throw new Error(`vfat: unexpected chain ${res?.chain_id} for ${chainId} on ${date}`);

  const row = res.data?.find((d: any) => d.date === date);
  if (!row) throw new Error(`vfat: no daily-users row for chain ${chainId} on ${date}`);

  const value = row[metric];
  if (!Number.isInteger(value) || value < 0) throw new Error(`vfat: ${metric} unavailable for chain ${chainId} on ${date}`);
  return value;
}
