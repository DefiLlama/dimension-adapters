import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchProtocolDayStats } from "./ramses-hl-cl";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchProtocolDayStats(options);
  const dailyFees = stats.clFeesUSD;
  const dailyVolume = stats.clVolumeUSD;

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
  chains: [CHAIN.ARBITRUM],
  start: "2026-01-13",
  methodology,
};

export default adapter;
