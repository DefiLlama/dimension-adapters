const { request, gql } = require("graphql-request");
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume, univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const blocksGraph = "https://graph.viper.exchange/subgraphs/name/harmony/blocks";
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
        timestampFrom: timestamp - 30,
        timestampTo: timestamp + 30,
      })
    ).blocks[0].number
  );

  return block;
};

const endpoints = {
  [CHAIN.HARMONY]: "https://graph.viper.exchange/subgraphs/name/venomprotocol/venomswap-v2",
};


const DAILY_VOLUME_FACTORY = "uniswapDayData";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
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
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.HARMONY]: {
      fetch: graphs(CHAIN.HARMONY),
      start: getStartTimestamp({
        endpoints,
        chain: CHAIN.HARMONY,
        dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
      }),
    },
  },
};

export default adapter;
