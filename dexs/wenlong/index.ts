import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// WenLong (https://wenlong.io) is a Telegram Mini App and web terminal for Hyperliquid perps. Every order it places
// carries its Hyperliquid builder code 0xb5e6e42154961f57021d06b7052c637155280025, at 0.02% of filled notional
// (0.016% for its first 500 traders), published at https://wenlong.io/terms.
// The endpoint sums, per UTC day, the Hyperliquid fills of every WenLong account (read account by account with
// userFillsByTime) whose builder fee is WenLong's rate, perps only, and splits them by account:
// - ton: accounts that sign in with a TON wallet in Telegram (they deposit and withdraw over TON)
// - hyperliquid: every other account (EVM and Solana wallets on the web)
// Cross-check: the builder's day in DefiLlama's Hyperliquid indexer,
// https://hl-indexer.llama.rip/v2/data/builder/0xb5e6e42154961f57021d06b7052c637155280025/daily/<startOfDay>
const STATS_API = "https://wenlong.io/api/stats/daily";

const ACCOUNTS_OF_CHAIN: Record<string, "ton" | "hyperliquid"> = {
  [CHAIN.TON]: "ton",
  [CHAIN.HYPERLIQUID]: "hyperliquid",
};

// both chains read the same day in one run, so each day is requested once
const days: Record<string, Promise<any>> = {};
function dayStats(date: string): Promise<any> {
  if (!days[date]) {
    days[date] = fetchURL(`${STATS_API}?date=${date}`).catch((error) => {
      delete days[date];
      throw error;
    });
  }
  return days[date];
}

const fetch = async (options: FetchOptions) => {
  // The endpoint answers 503 until the day is final, once every account has been read past midnight UTC
  const stats = await dayStats(options.dateString);
  const accounts = stats?.[ACCOUNTS_OF_CHAIN[options.chain]];
  if (stats?.date !== options.dateString || typeof accounts?.volumeUsd !== "number" || typeof accounts?.feesUsd !== "number")
    throw new Error(`WenLong stats: no ${options.chain} data for ${options.dateString}`);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(accounts.volumeUsd);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(accounts.feesUsd, "Hyperliquid Builder Code Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the endpoint serves whole UTC days
  doublecounted: true, // the trades are already counted in Hyperliquid's own volume and fees
  fetch,
  chains: [CHAIN.TON, CHAIN.HYPERLIQUID],
  // first day with fills through the builder code (Hyperliquid's builder_fills archive has no earlier file)
  start: "2026-07-03",
  methodology: {
    Volume: "Notional volume of Hyperliquid perpetual trades (including HIP-3 markets) placed through WenLong's builder code, summed from each WenLong account's own fills. TON counts accounts that sign in with a TON wallet in Telegram; Hyperliquid counts all other accounts.",
    Fees: "Hyperliquid builder code fees paid by users on perpetual trades placed through WenLong; excludes Hyperliquid's own trading fees.",
    Revenue: "Builder code fees collected by WenLong, before the referral rewards it later pays out of them.",
    ProtocolRevenue: "Builder code fees collected by WenLong's builder address, before the referral rewards it later pays out of them.",
  },
  breakdownMethodology: {
    Fees: { "Hyperliquid Builder Code Fees": "Builder code fees paid by users on Hyperliquid perpetual trades placed through WenLong." },
    Revenue: { "Hyperliquid Builder Code Fees": "Builder code fees collected by WenLong." },
    ProtocolRevenue: { "Hyperliquid Builder Code Fees": "Builder code fees collected by WenLong's builder address." },
  },
};

export default adapter;
