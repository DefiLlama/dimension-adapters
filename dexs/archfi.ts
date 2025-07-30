import { CHAIN } from "../helpers/chains";
const { request, } = require("graphql-request");
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { FetchOptions } from "../adapters/types";

export const LINKS: any = {
  [CHAIN.BOTANIX]: "https://api.studio.thegraph.com/query/113221/analytics/v0.0.1",
};

export const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400);
  const query = `{
    algebraDayData(id: ${dateId}) { feesUSD volumeUSD }
  }`;

  const data: any = await request(LINKS[options.chain], query);

  return {
    dailyFees: data.algebraDayData?.feesUSD,
    dailyUserFees: data.algebraDayData?.feesUSD,
    dailyVolume: data.algebraDayData?.volumeUSD,
  };
};

export default {
  adapter: {
    [CHAIN.BOTANIX]: {
      fetch,
      start: "2025-06-29",
    },
  },
};
