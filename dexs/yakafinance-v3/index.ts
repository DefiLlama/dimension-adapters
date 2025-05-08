import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<any> => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const query = `
    {
        algebraDayData(id:${dayID}) {
            id
            volumeUSD
            feesUSD
        }
    }`;
  const url = "https://api.studio.thegraph.com/query/50593/yaka-analytics/v0.0.3";
  const req = await request(url, query);
  return {
    dailyVolume: req.algebraDayData.volumeUSD,
    dailyFees: req.algebraDayData.feesUSD,
    dailyRevenue: req.algebraDayData.feesUSD* 0.12,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: '2024-10-01',
    },
  }
}

export default adapter;
