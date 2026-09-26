import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchVfatDailyUsers } from "../helpers/vfat";

// `chainId` is the chain's id in the vfat daily-users API scope.
// `start` is the later of 2024-11-01, the first day owner activity is indexed,
// and the chain's first Sickle deploy.
const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2024-11-01" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2024-11-01" },
  [CHAIN.CRONOS]: { chainId: 25, start: "2025-09-18" },
  [CHAIN.BSC]: { chainId: 56, start: "2024-11-01" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-03-11" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2024-11-01" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-25" },
  [CHAIN.SONIC]: { chainId: 146, start: "2024-12-26" },
  [CHAIN.FRAXTAL]: { chainId: 252, start: "2024-12-04" },
  [CHAIN.PULSECHAIN]: { chainId: 369, start: "2024-11-01" },
  [CHAIN.WC]: { chainId: 480, start: "2025-10-07" },
  [CHAIN.BOT_CHAIN]: { chainId: 677, start: "2026-08-26" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-05-26" },
  [CHAIN.LISK]: { chainId: 1135, start: "2025-06-13" },
  [CHAIN.METAL]: { chainId: 1750, start: "2025-06-13" },
  [CHAIN.SONEIUM]: { chainId: 1868, start: "2025-06-13" },
  [CHAIN.PEAQ]: { chainId: 3338, start: "2026-06-11" },
  [CHAIN.TEMPO]: { chainId: 4217, start: "2026-08-21" },
  [CHAIN.MEGAETH]: { chainId: 4326, start: "2026-04-04" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-11" },
  [CHAIN.MANTLE]: { chainId: 5000, start: "2024-11-01" },
  [CHAIN.ARC]: { chainId: 5042, start: "2026-09-16" },
  [CHAIN.ZETA]: { chainId: 7000, start: "2025-08-15" },
  [CHAIN.BASE]: { chainId: 8453, start: "2024-11-01" },
  [CHAIN.PLASMA]: { chainId: 9745, start: "2025-09-26" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-11-01" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2024-11-01" },
  [CHAIN.CELO]: { chainId: 42220, start: "2025-08-09" },
  [CHAIN.ETHERLINK]: { chainId: 42793, start: "2025-10-28" },
  [CHAIN.HEMI]: { chainId: 43111, start: "2025-05-10" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2024-11-01" },
  [CHAIN.INK]: { chainId: 57073, start: "2025-02-28" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-11-01" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-20" },
  [CHAIN.SCROLL]: { chainId: 534352, start: "2024-11-01" },
  [CHAIN.KATANA]: { chainId: 747474, start: "2025-07-10" },
};

const fetch = async (options: FetchOptions) => {
  const { chainId } = chainConfig[options.chain];
  return {
    dailyActiveUsers: await fetchVfatDailyUsers(options, chainId, "active_users"),
  };
};

const methodology = {
  ActiveUsers:
    "Sickle owner wallets with at least one executed vfat Sickle action on the chain during the UTC day. Includes owners whose only actions that day were automation they configured and pay for (compound, rebalance, harvest, exit); skipped or failed keeper attempts are not counted. Counted per chain, so a wallet active on several chains is counted once on each.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
