import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";

const blocksGraph =
  "https://okinfo.cherryswap.net/subgraphs/name/cherryswap/block";

const blockQuery = gql`
  query blocks($timestampFrom: Int!, $timestampTo: Int!) {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gt: $timestampFrom, timestamp_lt: $timestampTo }
    ) {
      id
      number
      timestamp
      __typename
    }
  }
`;


const endpoints = {
  [CHAIN.OKEXCHAIN]: "https://okinfo.cherryswap.net/subgraphs/name/cherryswap/cherrysubgraph"
}
const getCustomBlock = async (timestamp: number) => {
  const block = Number(
    (
      await request(blocksGraph, blockQuery, {
        timestampFrom: timestamp - 30,
        timestampTo: timestamp + 30,
      })
    ).blocks[0].number
  );

  return block;
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  getCustomBlock,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OKEXCHAIN]: {
      fetch: async () => {
        return {
          dailyVolume: '0'
        }
      },
      start: '2021-07-27',
    },
  },
};

export default adapter;
