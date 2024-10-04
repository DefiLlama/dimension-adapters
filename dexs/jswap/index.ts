import request, { gql } from "graphql-request";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import disabledAdapter from "../../helpers/disabledAdapter";

const blocksGraph =
  "https://graph.jfswap.com/subgraphs/name/blocklytics/oec-blocks";

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
  [CHAIN.OKEXCHAIN]: "https://graph.jfswap.com/subgraphs/name/jfswap/jfswap-subgraph"
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

const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "jswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  getCustomBlock,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.OKEXCHAIN]: {
      fetch: graphs(CHAIN.OKEXCHAIN),
      start: 1627385129,
    },
  },
};

export default adapter;
