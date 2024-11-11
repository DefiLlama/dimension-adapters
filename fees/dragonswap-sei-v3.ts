import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";


const graphs = async (_t: any, _b: any, options: FetchOptions) => {


      const dayID = Math.floor(options.startOfDay / 86400);
      const query =gql`
      {
          uniswapDayData(id:${dayID}) {
              id
              volumeUSD
              feesUSD
          }

      }`;
      const url = "https://api.goldsky.com/api/public/project_clu1fg6ajhsho01x7ajld3f5a/subgraphs/dragonswap-v3-prod/1.0.0/gn";
      const req = await request(url, query);
      const dailyFee = Number(req.uniswapDayData.feesUSD);
      return {
        timestamp: options.startOfDay,
        dailyFees: dailyFee.toString(),
        // dailyLPProvidersRevenue: (dailyFee * 0.7).toString(),
        // dailyRevenue: (dailyFee * 0.3).toString(),
      };

};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      fetch: graphs,
    }
  }
}

export default adapter;
