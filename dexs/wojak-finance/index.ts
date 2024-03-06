import { CHAIN } from "../../helpers/chains";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24
const { request, gql } = require("graphql-request");
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [CHAIN.DOGECHAIN]:
    "https://api.dogechainhealth.com/subgraphs/name/wojakswap/exchange",
};

const blocksGraph =
  "https://api.dogechainhealth.com/subgraphs/name/wojakswap/blocks";

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


const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "pancakeFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  getCustomBlock,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.DOGECHAIN]: {
      fetch: graphs(CHAIN.DOGECHAIN),
      start: 1661731200,
    },
  },
};

export default adapter;
