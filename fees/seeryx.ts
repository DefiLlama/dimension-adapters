import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Seeryx: a non-custodial prediction market on Solana (politics, sports, esports, finance, crypto and other markets).
// Orders are matched off chain in a central limit order book and every fill is settled by the Seeryx program on Solana
// (2uUbvYHqBH1HDVzABGPcqrjHodoBVcNkq6Nrv6MABaiv), where the taker fee of each fill goes to the program's Fees account and
// the maker rebate to the maker. Settlement transactions carry the fill but not its fee split, so the figures come from
// the exchange's public daily statistics, one row per UTC day: https://seeryx.com/developers (GET /api/stats/daily).
// A day's row is final once the day is over, which is why this is a version 1 adapter.

const API = "https://seeryx.com/api/stats/daily";

type Day = {
  day: string;
  volume: number;      // USDC: shares x price of every fill
  trades: number;
  traders: number;
  takerFees: number;   // USDC: what takers paid (7% x p x (1 - p) per share)
  makerRebates: number; // USDC: the part of the taker fees paid out to makers (20%)
  returned: number;    // USDC: fees given back on trades the program refused (undone fills)
  earned: number;      // USDC: what the exchange kept (taker fees - rebates - returned)
};

const EMPTY: Day = { day: "", volume: 0, trades: 0, traders: 0, takerFees: 0, makerRebates: 0, returned: 0, earned: 0 };

export async function fetchDay(options: FetchOptions): Promise<Day> {
  const day = options.dateString;
  const { days } = await fetchURL(`${API}?from=${day}&to=${day}`);
  return (days as Day[]).find((d) => d.day === day) ?? { ...EMPTY, day };
}

const fetch = async (options: FetchOptions) => {
  const d = await fetchDay(options);
  // fees that stand: what takers paid less what was given back on fills the program refused
  const dailyFees = d.takerFees - d.returned;
  const dailyRevenue = d.earned;
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees - dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-04",
  // a fill undone the day after it paid gives its fee back on the later day, which can make that day negative
  allowNegativeValue: true,
  methodology: {
    Fees: "Taker fees paid on every fill: 7% x price x (1 - price) per share, so highest at even odds and near zero at the edges; fees given back on fills the program refused are deducted. Makers pay no fee.",
    UserFees: "The same taker fees.",
    Revenue: "What the exchange kept: taker fees less the maker rebates and less the fees returned on refused fills. Collected into the Fees account of the Seeryx program on Solana.",
    ProtocolRevenue: "All revenue goes to the protocol; there is no token.",
    SupplySideRevenue: "Maker rebates: 20% of each fill's taker fee is paid to the maker whose resting order it filled.",
  },
};

export default adapter;
