import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";

const key = process.env.THEGRAPH_API_KEY;

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
      const url = "https://gateway.thegraph.com/api/subgraphs/id/Hw24iWxGzMM5HvZqENyBQpA6hwdUTQzCSK5e5BfCXyHd";
      const req = await request(url, query);
      const dailyFee = Number(req.uniswapDayData.feesUSD);
      return {
        timestamp: options.startOfDay,
        dailyFees: dailyFee.toString(),
        dailyRevenue: (dailyFee * 0.25).toString(),
      };

};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch: graphs,
    }
  }
}


export default adapter;
