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

const fetch = async (options: FetchOptions) => {
  const day = options.dateString;
  const { days } = await fetchURL(`${API}?from=${day}&to=${day}`);
  const d = (days as Day[]).find((d) => d.day === day)
  if (!d) throw new Error(`seeryx: no data found for ${day}`);
  // fees that stand: what takers paid less what was given back on fills the program refused
  const takerFees = d.takerFees - d.returned;
  // what the exchange kept; the rest (the maker rebates) is the residual, so fees = revenue + supply side holds exactly
  const toProtocol = d.earned;
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(takerFees, "Taker Fees");
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(toProtocol, "Taker Fees To Protocol");
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(takerFees - toProtocol, "Maker Rebates");
  return {
    dailyVolume: d.volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-04",
  // a fill undone the day after it paid gives its fee back on the later day, which can make that day negative
  allowNegativeValue: true,
  // fee rates: https://seeryx.com/developers/fees (taker fee 7% x p x (1 - p) per share, maker rebate 20% of the taker fee)
  methodology: {
    Volume: "USDC value of every share traded across all Seeryx prediction markets (shares times fill price), counted once per fill and excluding the exchange's own test trades.",
    Fees: "Taker fees paid by traders whose orders fill against a resting order, at 7% x price x (1 - price) per share, minus fees refunded on trades that failed to settle on Solana; deposit and withdrawal fees are not included.",
    UserFees: "Taker fees paid by traders on every fill, at 7% x price x (1 - price) per share, minus fees refunded on trades that failed to settle; makers pay no fee.",
    Revenue: "Taker fees kept by Seeryx after paying 20% back to makers as rebates and refunding fees on trades that failed to settle.",
    ProtocolRevenue: "Taker fees kept by Seeryx after maker rebates and refunds, collected into the fee account of the Seeryx program on Solana; Seeryx has no token, so all of it goes to the protocol.",
    SupplySideRevenue: "Rebates paid to market makers: 20% of each fill's taker fee goes to the trader whose resting order was filled.",
  },
  breakdownMethodology: {
    Fees: {
      "Taker Fees": "Taker fees on every fill (7% x price x (1 - price) per share, highest at 50 cents and near zero at 1 or 99 cents), minus fees refunded on trades that failed to settle.",
    },
    UserFees: {
      "Taker Fees": "Taker fees paid by traders on every fill (7% x price x (1 - price) per share), minus fees refunded on trades that failed to settle; makers pay no fee.",
    },
    Revenue: {
      "Taker Fees To Protocol": "Taker fees kept by Seeryx after the 20% maker rebates and refunds on trades that failed to settle.",
    },
    ProtocolRevenue: {
      "Taker Fees To Protocol": "Taker fees kept by Seeryx after maker rebates and refunds, collected into the fee account of the Seeryx program on Solana.",
    },
    SupplySideRevenue: {
      "Maker Rebates": "20% of each fill's taker fee, paid to the trader whose resting order was filled.",
    },
  },
};

export default adapter;
