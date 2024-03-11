import { SimpleAdapter } from "../../adapters/types";

const { request, gql } = require("graphql-request");
const { RONIN } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [RONIN]: "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-subgraph-blue",
};

const blocksGraph =
  "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/ronin-blocks";
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

const DAILY_VOLUME_FACTORY = "katanaDayData";

const graphs = getChainVolume({
  graphUrls: {
    [RONIN]: endpoints[RONIN],
  },
  totalVolume: {
    factory: "katanaFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  getCustomBlock,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [RONIN]: {
      fetch: graphs(RONIN),
      start: 1635724800,
    },
  },
};

export default adapter;
