import { ChainEndpoints, BreakdownAdapter } from "../../adapters/types";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";

const endpoints: ChainEndpoints = {
  [CHAIN.KAVA]: "https://the-graph.kava.io/subgraphs/name/surfswap-dex",
};
const blocksGraph = "https://analytics.surfdex.io/api/moonblocks";

const DAY_IN_SECONDS = 60 * 60 * 24
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
  const block =
    (
      await request(blocksGraph, blockQuery, {
        timestampFrom: timestamp - DAY_IN_SECONDS,
        timestampTo: timestamp,
      })
    )
  return Number(block.blocks[0].number);
};

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
  },
  getCustomBlock
});

const v1graphs = getGraphDimensions({
  graphUrls: {
    [CHAIN.KAVA]: "https://the-graph.kava.io/subgraphs/name/surfswap-stable-amm",
  },
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
  getCustomBlock
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    classic: {
      [CHAIN.KAVA]: {
        fetch: graphs(CHAIN.KAVA as Chain),
        start: 1659715200,
      },
    },
    "stable-amm": {
      [CHAIN.KAVA]: {
        fetch: v1graphs(CHAIN.KAVA as Chain),
        start: 1656547200,
      },
    },
  }
}

export default adapter;
