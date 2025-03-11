import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";

const methodology = {
  Fees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  LPProvidersRevenue:
    "Fees distributed to the LP providers (84% of total accumulated fees).",
  ProtocolAccumulation:
    "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
};

const graphs = async (_t: any, _b: any, options: FetchOptions) => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const query = gql`
      {
          uniswapDayData(id:${dayID}) {
              id
              volumeUSD
              feesUSD
          }

      }`;
  const url = "https://subgraph.sailor.finance/subgraphs/name/sailor";
  const req = await request(url, query);
  const dailyFee = Number(req.uniswapDayData.feesUSD);
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFee.toString(),
    // dailyLPProvidersRevenue: (dailyFee * 0.84).toString(),
    dailyRevenue: (dailyFee * 0.16).toString(),
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      fetch: graphs,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
