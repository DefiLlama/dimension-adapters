import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchVfatDailyUsers } from "../helpers/vfat";

// `chainId` is the chain's id in the vfat daily-users API scope.
// `start` is the chain's first Sickle deploy, the API's `first_day`.
const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2023-01-05" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2023-12-05" },
  [CHAIN.CRONOS]: { chainId: 25, start: "2025-09-18" },
  [CHAIN.BSC]: { chainId: 56, start: "2023-01-02" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-03-11" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2022-12-30" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-25" },
  [CHAIN.SONIC]: { chainId: 146, start: "2024-12-26" },
  [CHAIN.FRAXTAL]: { chainId: 252, start: "2024-12-04" },
  [CHAIN.PULSECHAIN]: { chainId: 369, start: "2023-01-05" },
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
  [CHAIN.MANTLE]: { chainId: 5000, start: "2024-01-22" },
  [CHAIN.ARC]: { chainId: 5042, start: "2026-09-16" },
  [CHAIN.ZETA]: { chainId: 7000, start: "2025-08-15" },
  [CHAIN.BASE]: { chainId: 8453, start: "2023-09-21" },
  [CHAIN.PLASMA]: { chainId: 9745, start: "2025-09-26" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-05-16" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2023-06-02" },
  [CHAIN.CELO]: { chainId: 42220, start: "2025-08-09" },
  [CHAIN.ETHERLINK]: { chainId: 42793, start: "2025-10-28" },
  [CHAIN.HEMI]: { chainId: 43111, start: "2025-05-10" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2023-05-31" },
  [CHAIN.INK]: { chainId: 57073, start: "2025-02-28" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-05-10" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-20" },
  [CHAIN.SCROLL]: { chainId: 534352, start: "2024-10-09" },
  [CHAIN.KATANA]: { chainId: 747474, start: "2025-07-10" },
};

const fetch = async (options: FetchOptions) => {
  const { chainId } = chainConfig[options.chain];
  return {
    dailyNewUsers: await fetchVfatDailyUsers(options, chainId, "new_users"),
  };
};

const methodology = {
  NewUsers:
    "Wallets that deployed their first vfat Sickle on the chain during the UTC day. A second Sickle for an existing owner is not a new user. Counted per chain, so a wallet that starts on a second chain is new on that chain too.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
