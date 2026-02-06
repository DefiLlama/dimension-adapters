import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions, FetchV2 } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { time } from "console";

const key = process.env.THEGRAPH_API_KEY;

const endpoints = {
  [CHAIN.MEGAETH]: "https://gateway.thegraph.com/api/subgraphs/id/3berhRZGzFfAhEB5HZGHEsMAfQ2AQpDk2WyVr5Nnkjyv"
}

const methodology = {
  Fees: "CurrentX protocol swap fee (0.3% per swap).",
  LPProvidersRevenue: "Fees distributed to the LP providers (70% of total accumulated fees).",
  ProtocolAccumulation: "Fees sent to the protocol wallet (30% of total accumulated fees), is used to provide benefits to users in custom ways."
}

const graphs = async (_t: any, _b: any, options: FetchOptions) => {


      const dayID = Math.floor(options.startOfDay / 86400);
      const query =gql`
      {
          uniswapDayData(id:${dayID}) {
              id
              dailyVolumeUSD
              dailyFeesUSD
          }

      }`;
      const url = "https://gateway.thegraph.com/api/subgraphs/id/3berhRZGzFfAhEB5HZGHEsMAfQ2AQpDk2WyVr5Nnkjyv";
      const req = await request(url, query);
      const dailyFee = Number(req.uniswapDayData.dailyFeesUSD);
      return {
        timestamp: options.startOfDay,
        dailyFees: dailyFee.toString(),
        // dailyLPProvidersRevenue: (dailyFee * 0.7).toString(),
        dailyRevenue: (dailyFee * 0.3).toString(),
      };

};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch: graphs,
    }
  },
  methodology
}


export default adapter;
