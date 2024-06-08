import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.SEI]: "https://api.goldsky.com/api/public/project_clu1fg6ajhsho01x7ajld3f5a/subgraphs/dragonswap-prod/1.0.0/gn"
}

const methodology = {
  Fees: "DragonSwap protocol swap fee (0.3% per swap).",
  LPProvidersRevenue: "Fees distributed to the LP providers (70% of total accumulated fees).",
  ProtocolAccumulation: "Fees sent to the protocol wallet (30% of total accumulated fees), is used to provide benefits to users in custom ways."
}

const graphs = (graphUrls: ChainEndpoints) => {
    const fetch: FetchV2 = async ({ chain, startTimestamp }) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(startTimestamp)

      const graphQuery = gql
      `{
        uniswapDayDatas(where: {date: ${todaysTimestamp}}) {
          dailyFeesUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = graphRes.uniswapDayDatas[0].dailyFeesUSD;

      return {
        dailyFees: dailyFee.toString(),
        dailyLPProvidersRevenue: (dailyFee * 0.7).toString(),
        dailyProtocolAccumulation: (dailyFee * 0.3).toString(),
      };
    };
    return fetch
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch: graphs(endpoints),
      start: 79157663,
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
