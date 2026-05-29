import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./pharaoh-v3";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = stats.legacyFeesUSD;
  const dailyVolume = stats.legacyVolumeUSD;
  const swapFeesToHolders = stats.legacyUserFeesRevenueUSD;
  const dailyProtocolRevenue = stats.legacyProtocolRevenueUSD;
  const bribes = stats.legacyBribeRevenueUSD;

  // External voting bribes accrue to holders but are passthrough incentives
  // (not protocol earnings), so they're added to dailyHoldersRevenue and
  // excluded from dailyRevenue.
  const dailyHoldersRevenue = swapFeesToHolders + bribes;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue + swapFeesToHolders,
    dailySupplySideRevenue: dailyFees - swapFeesToHolders - dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap.",
  Revenue: "Swap-fee share kept by the protocol plus swap-fee share distributed to holders. External voting bribes are passthrough incentives and excluded.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "Swap-fee share distributed to holders plus external voting bribes routed to vePHAR holders.",
  SupplySideRevenue: "Fees distributed to LPs.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.AVAX],
  start: '2025-10-08',
  methodology,
};

export default adapter;
