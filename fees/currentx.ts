import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions, FetchV2 } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { time } from "console";

const endpoints = {
  [CHAIN.MEGAETH]: "https://api.goldsky.com/api/public/project_cmlbj5xkhtfha01z0caladt37/subgraphs/currentx-v2/1.0.0/gn"
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
          }

      }`;
      const url = "https://api.goldsky.com/api/public/project_cmlbj5xkhtfha01z0caladt37/subgraphs/currentx-v2/1.0.0/gn";
      const req = await request(url, query);
      if (!req.uniswapDayData) {
        return { timestamp: options.startOfDay, dailyFees: "0", dailyRevenue: "0" };
      }
      const dailyVolume = Number(req.uniswapDayData.dailyVolumeUSD ?? 0);
      const dailyFee = dailyVolume * 0.003;
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



