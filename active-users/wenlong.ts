import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// WenLong accounts that traded Hyperliquid perps through its builder code 0xb5e6e42154961f57021d06b7052c637155280025
// that day, from each account's own fills (see dexs/wenlong): `ton` = accounts that sign in with a TON wallet in
// Telegram, `hyperliquid` = every other account.
const STATS_API = "https://wenlong.io/api/stats/daily";

const ACCOUNTS_OF_CHAIN: Record<string, "ton" | "hyperliquid"> = {
  [CHAIN.TON]: "ton",
  [CHAIN.HYPERLIQUID]: "hyperliquid",
};

const fetch = async (options: FetchOptions) => {
  // The endpoint answers 503 until the day is final, once every account has been read past midnight UTC
  const stats = await fetchURL(`${STATS_API}?date=${options.dateString}`);
  const accounts = stats?.[ACCOUNTS_OF_CHAIN[options.chain]];
  if (stats?.date !== options.dateString || typeof accounts?.traders !== "number" || typeof accounts?.fills !== "number")
    throw new Error(`WenLong stats: no ${options.chain} data for ${options.dateString}`);

  return {
    dailyActiveUsers: accounts.traders,
    dailyTransactionsCount: accounts.fills,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the endpoint serves whole UTC days
  fetch,
  chains: [CHAIN.TON, CHAIN.HYPERLIQUID],
  start: "2026-07-03",
  methodology: {
    ActiveUsers: "WenLong accounts with at least one Hyperliquid perpetual fill through its builder code that day; TON counts accounts that sign in with a TON wallet, Hyperliquid all others.",
    TransactionsCount: "Hyperliquid perpetual fills of those accounts through WenLong's builder code that day.",
  },
};

export default adapter;
