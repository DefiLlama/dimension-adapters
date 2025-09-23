import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./shadow-exchange";

type TStartTime = {
  [key: string]: number;
};

const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

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
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  BribesRevenue: "Bribes are distributed among holders.",
};

const adapter: SimpleAdapter = {
  methodology,
  fetch,
  chains: [CHAIN.SONIC],
  start: startTimeV2[CHAIN.SONIC],
};

export default adapter;
