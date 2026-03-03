import { Adapter, FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "Maker/taker volume on Toro perpetuals",
  Fees: "Trading fees collected by the protocol",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue goes to the protocol",
  ActiveUsers: "Number of connected users on the platform",
};

const url = "https://toro-api.vercel.app/api/v1/broker/daily-stats";
const builderStatsUrl = "https://toro-api.vercel.app/api/v1/broker/builder-stats";
let statsCache: any = null;

async function fetch(_: any, _1: any, { dateString }: FetchOptions) {
  if (!statsCache) {
    statsCache = httpGet(url).then((data) => {
      const dateDataMap: any = {};
      data.forEach((i: any) => {
        dateDataMap[i.dateString || i.date?.slice(0, 10)] = i;
      });
      return dateDataMap;
    });
  }

  const dataMap = await statsCache;
  const data = dataMap[dateString];
  const builderStats = await httpGet(builderStatsUrl);
  const dailyActiveUsers = builderStats?.data?.connected_user ?? 0;

  const dailyVolume = data ? +data.takerVolume + +data.makerVolume : 0;
  const dailyFees = data ? +data.builderFee : 0;
  const dailyRevenue = dailyFees;
  const dailyProtocolRevenue = dailyRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyActiveUsers,
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2025-12-10",
    },
  },
  methodology,
};

export default adapter;
