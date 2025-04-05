import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./shadow-exchange";

type TStartTime = {
    [key: string]: number;
  };

const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options)
  
  const dailyFees = stats.legacyFeesUSD
  const dailyVolume = stats.legacyVolumeUSD

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };

}

const methodology = {
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: startTimeV2[CHAIN.SONIC],
      meta: {
        methodology: methodology
      },
    },
  },
};

export default adapter;
