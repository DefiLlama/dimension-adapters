import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./ramses-hl-cl";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);
  const dailyFees = stats.clFeesUSD;
  const dailyVolume = stats.clVolumeUSD;
  const dailyHoldersRevenue = stats.clUserFeesRevenueUSD;
  const dailyProtocolRevenue = stats.clProtocolRevenueUSD;
  const dailyBribesRevenue = stats.clBribeRevenueUSD;

  const dailySupplySideRevenue =
    stats.clFeesUSD - dailyHoldersRevenue - dailyProtocolRevenue;
  const dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyBribesRevenue,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  BribesRevenue: "Bribes are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
  TokenTax: "xRAM stakers instant exit penalty",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2026-01-28",
  methodology,
};

export default adapter;
