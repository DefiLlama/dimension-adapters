/**
 * topblast.lol — TON launchpad (DeDust Uranus bonding curves)
 *
 * Volume: USD notional of bonding-curve buys and sells.
 * Fees:   trading fees on every bonding-curve buy/sell plus token launch fees,
 *         measured from on-chain TON inflows to the two protocol fee wallets:
 *           UQClgkR0eLgWAR0tZh8YbQyDqa-Jn5wUP1XHPLDB6RmAPySF
 *           0:a582447478b816011d2d661f186d0c83a9af899f9c143f55c73cb0c1e919803f
 *           UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 *           0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 *
 * 100% of collected fees are protocol revenue. Nothing is shared with LPs or
 * token holders, so SupplySideRevenue and HoldersRevenue are 0. Downstream
 * uses of that revenue (tournament prize pools) are discretionary protocol
 * spending, not a holder distribution.
 *
 * Data source: public, no-API-key stats endpoint (full-UTC-day granularity)
 *   https://gyihzeiwelsuikfrschp.supabase.co/functions/v1/defillama?date=YYYY-MM-DD
 */

import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_API = "https://gyihzeiwelsuikfrschp.supabase.co/functions/v1/defillama";

interface DayStats {
  date: string;
  dailyVolume: number;
  dailyFees: number;
  dailyUserFees: number;
  dailyRevenue: number;
  dailyProtocolRevenue: number;
  dailySupplySideRevenue: number;
  dailyHoldersRevenue: number;
}

// The source only exposes full UTC days, so this is a version 1 (daily) adapter.
const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);

  const stats: DayStats = await httpGet(`${STATS_API}?date=${date}`);

  return {
    dailyVolume: stats.dailyVolume,
    dailyFees: stats.dailyFees,
    dailyUserFees: stats.dailyUserFees,
    dailyRevenue: stats.dailyRevenue,
    dailyProtocolRevenue: stats.dailyProtocolRevenue ?? stats.dailyRevenue,
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume:
    "USD notional of all buys and sells executed on topblast.lol bonding curves on TON, derived from collected fees at the 1% fee rate (volume = fees / 0.01).",
  Fees: "Trading fees on every bonding-curve buy/sell plus token launch fees, collected on-chain at the two topblast.lol fee wallets (UQClgkR0eLgWAR0tZh8YbQyDqa-Jn5wUP1XHPLDB6RmAPySF and UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q). Wallet-to-wallet transfers and failed transactions are excluded.",
  UserFees: "Same as Fees — traders pay the fee on every bonding-curve buy/sell, and creators pay the launch fee.",
  Revenue:
    "100% of collected fees are retained by the protocol. Creator and deployer fees are claimed directly on-chain by those wallets and never reach the protocol fee wallets, so they are not counted.",
  ProtocolRevenue:
    "100% of collected fees. Discretionary downstream spending of that revenue (Parabola and Topblast Friday tournament prize pools) is not a holder or LP distribution.",
  SupplySideRevenue: "0 — bonding-curve venue, no fees are shared with liquidity providers.",
  HoldersRevenue: "0 — no fees are distributed to token holders.",
};

const breakdownMethodology = {
  Volume: {
    "Bonding curve trades": "Buys and sells on topblast.lol bonding curves on TON.",
  },
  Fees: {
    "Trading fees": "1% fee on every bonding-curve buy and sell.",
    "Launch fees": "Fees paid by creators when deploying a token.",
  },
  Revenue: {
    "Protocol revenue": "100% of trading and launch fees retained by topblast.lol.",
  },
  ProtocolRevenue: {
    "Protocol revenue": "100% of trading and launch fees retained by topblast.lol.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      // topblast.lol went live 1 May 2026 — no protocol fees exist before this date.
      start: "2026-05-01",
      meta: { methodology, breakdownMethodology },
    },
  },
};

export default adapter;
