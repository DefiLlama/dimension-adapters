import { Adapter, FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "Maker/taker volume on Toro perpetuals",
  Fees: "Trading fees collected by the protocol",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue goes to the protocol",
};

const url = "https://toro-api.vercel.app/api/v1/broker/daily-stats";
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

  if (!data) {
    throw new Error("Data missing for date: " + dateString);
  }

  const dailyVolume = +data.takerVolume + +data.makerVolume;
  const dailyFees = +data.builderFee;
  const dailyRevenue = dailyFees;
  const dailyProtocolRevenue = dailyRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
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
