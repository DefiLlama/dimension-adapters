import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";


const graphs = async (_t: any, _b: any, options: FetchOptions) => {


      const dayID = Math.floor(options.startOfDay / 86400);
      const query =gql`
      {
          pancakeDayData(id:${dayID}) {
              id
              volumeUSD
              feesUSD
          }

      }`;
      const url = "https://gateway.graph.dgswap.io/dgswap-exchange-v3-kaia";
      const req = await request(url, query);
      const dailyFee = Number(req.pancakeDayData.feesUSD);
      return {
        timestamp: options.startOfDay,
        dailyFees: dailyFee.toString(),
        dailyRevenue: (dailyFee * 0.25).toString(),
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
