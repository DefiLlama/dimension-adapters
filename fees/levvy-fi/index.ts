import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const fetch: any = async (options: FetchOptions) => {
  const startDateTime = new Date(options.startTimestamp * 1000).toISOString();
  const { data } = await axios.post(
    `https://8080-truthful-birthday-xc2vhr.us1.demeter.run/api/v1/nft/platform/stats?from=${startDateTime}&timeFrame=${24}`,
  );

  return {
    dailyFees: Number(data.totalFees) / 1e6,
    dailyRevenue: Number(data.totalRevenue) / 1e6,
    dailyVolume: Number(data.totalVolume) / 1e6,
  };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch: fetch,
      start: '2023-10-11',
    },
  },
};