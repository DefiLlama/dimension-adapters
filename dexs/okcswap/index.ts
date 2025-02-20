import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";

const blocksGraph = "https://www.okx.com/okc/subgraph/name/okcswap/okc-swap-subgraph-v3";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24
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
  [CHAIN.OKEXCHAIN]: "https://www.okx.com/okc/subgraph/name/okcswap/okc-swap-subgraph-v3"
}
const getCustomBlock = async (timestamp: number) => {
  const block = Number(
    (
      await request(blocksGraph, blockQuery, {
        timestampFrom: timestamp - ONE_DAY_IN_SECONDS,
        timestampTo: timestamp + ONE_DAY_IN_SECONDS,
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
      fetch: graphs(CHAIN.OKEXCHAIN),
      start: '2022-08-22',
    },
  },
};

export default adapter;
