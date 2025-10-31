import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";


const blockNumberGraph = "https://perpgql.trado.one/subgraphs/name/trado/flow_blocks"

async function getBlock(timestamp: number) {

  const blockNumerQuery = `
  {
      blocks(
        where: {timestamp_lte:${timestamp}}
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        id
        number
      }
    }
  `;
  const blockNumberGraphQLClient = new GraphQLClient(blockNumberGraph)
  return (await blockNumberGraphQLClient.request(blockNumerQuery)).blocks[0].number

}

async function getTotalVolume(timestamp: number) {
  const graphQLClient = new GraphQLClient("https://perpgql.trado.one/subgraphs/name/trado/flow");
  const block = await getBlock(timestamp)
  const tradeVolumeQuery = `
  {
    protocolMetrics(block:{number:${block}}){
      totalVolume
    }
  }`
  return (await graphQLClient.request(tradeVolumeQuery)).protocolMetrics[0].totalVolume
}

const fetch = async ({ fromTimestamp, toTimestamp, }: FetchOptions) => {
  const endVolume = await getTotalVolume(toTimestamp)
  const startVolume = await getTotalVolume(fromTimestamp)

  return {
    dailyVolume: (endVolume - startVolume)/1e6,
  };
}


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
