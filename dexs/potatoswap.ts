import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";

const endpoint = "https://indexer.potatoswap.finance/subgraphs/id/Qmaeqine8JeSiKV3QCi6JJqzDGryF7D8HCJdqcYxW7nekw";

const query = gql`
  {
    pancakeFactories(first: 1) {
      totalVolumeUSD
    }
  }
`;

async function fetchVolume() {
  const res = await request(endpoint, query);
  const volume = Number(res.pancakeFactories[0].totalVolumeUSD);
  return {
    totalVolume: volume,
  };
}

const methodology = {
  Volume: "Cumulative swap volume in USD from PotatoSwap subgraph on X Layer network.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch: fetchVolume,
      start: 1713820800, // April 23, 2024
    },
  },
};

export default adapter;