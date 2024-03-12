import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
const { request, gql } = require("graphql-request");
const { RONIN } = require("../../helpers/chains");
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [RONIN]:
    "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-subgraph-blue",
};

const blocksGraph =
  "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/ronin-blocks";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
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
  const timestampFrom = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000),
  );

  const block = Number(
    (
      await request(blocksGraph, blockQuery, {
        timestampFrom,
        timestampTo: timestampFrom + ONE_DAY_IN_SECONDS - 1,
      })
    ).blocks[0].number,
  );

  return block;
};

const fetch: FetchV2 = async (options) => {
  const data = await getChainVolume({
    graphUrls: {
      [RONIN]: endpoints[RONIN],
    },
    totalVolume: {
      factory: "katanaFactories",
      field: DEFAULT_TOTAL_VOLUME_FIELD,
    },
    dailyVolume: {
      factory: "katanaDayData",
      field: DEFAULT_DAILY_VOLUME_FIELD,
    },
    getCustomBlock,
  })(options.chain)(options);

  return {
    dailyFees: data.dailyVolume * 0.003,
    dailyProtocolRevenue: data.dailyVolume * 0.0005,
    dailySupplySideRevenue: data.dailyVolume * 0.0025,
    dailyUserFees: data.dailyVolume * 0.003,
    ...data,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [RONIN]: {
      fetch,
      start: 1635724800,
    },
  },
};

export default adapter;
