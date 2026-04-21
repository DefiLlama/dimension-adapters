import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./ramses-hl-cl";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = stats.legacyFeesUSD;
  const dailyVolume = stats.legacyVolumeUSD;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap.",
  UserFees: "User pays fees on each swap.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2026-01-28",
  methodology,
};

export default adapter;
