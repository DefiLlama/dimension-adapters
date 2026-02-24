import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./ramses-hl-cl";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = stats.legacyFeesUSD;
  const dailyVolume = stats.legacyVolumeUSD;
  const dailyHoldersRevenue = stats.legacyUserFeesRevenueUSD;
  const dailyProtocolRevenue = stats.legacyProtocolRevenueUSD;
  const dailyBribesRevenue = stats.legacyBribeRevenueUSD;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue + dailyHoldersRevenue,
    dailySupplySideRevenue: dailyFees - dailyHoldersRevenue - dailyProtocolRevenue,
    dailyBribesRevenue,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs.",
  BribesRevenue: "Bribes are distributed among holders.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-11-08',
  methodology,
};

export default adapter;
