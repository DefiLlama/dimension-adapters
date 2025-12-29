import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const graphQLClient = new GraphQLClient(
  "https://api.flowx.finance/flowx-be/graphql"
);

const getPools = () => {
  return gql`
    query {
      getClmmPools {
        id
        volumeUSD
      }
    }
  `;
};

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const poolsRes = await graphQLClient.request(getPools());

  const totalVolume = poolsRes.getClmmPools.reduce((sum: number, pool: any) => {
    return sum + parseFloat(pool.volumeUSD || "0");
  }, 0);

  return {
    dailyVolume: totalVolume.toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-05-10",
    },
  },
  methodology: {
    Volume: "Daily trading volume aggregated from individual FlowX CLMM pool volume data.",
  },
};

export default adapter;
