const { request, gql } = require("graphql-request");
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill, { IGraphs } from "../../helpers/customBackfill";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const blocksGraph = "https://teste.testeborabora.cyou/graphql";
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
  const block =
    (
      await request(blocksGraph, blockQuery, {
        timestampFrom: timestamp - ONE_DAY_IN_SECONDS,
        timestampTo: timestamp + ONE_DAY_IN_SECONDS,
      })
    ).blocks[0].number
  ;
  return Number(block);
};

const endpoints = {
  [CHAIN.VELAS]: "https://testeborabora.cyou/subgraphs/name/wavelength22"
}
const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
  // getCustomBlock,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VELAS]: {
      fetch: graphs(CHAIN.VELAS),
      start: 1666263553,
      customBackfill: customBackfill(CHAIN.VELAS, graphs as unknown as IGraphs)
    },
  },
};

export default adapter;
