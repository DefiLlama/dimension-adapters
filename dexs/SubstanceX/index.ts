import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";


const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/substanceexchangedevelop/coreprod",
};

const blockNumberGraph = {
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-one-blocks",
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {

      if (chain === CHAIN.ARBITRUM) {
        // Get blockNumers
        const blockNumerQuery = gql`
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
        const last24hBlockNumberQuery = gql`
        {
            blocks(
              where: {timestamp_lte:${timestamp - 24 * 60 * 60}}
              orderBy: timestamp
              orderDirection: desc
              first: 1
            ) {
              id
              number
            }
          }
        `;

        const blockNumberGraphQLClient = new GraphQLClient(blockNumberGraph[chain]);
        const graphQLClient = new GraphQLClient(graphUrls[chain]);


        const blockNumber = (
          await blockNumberGraphQLClient.request(blockNumerQuery)
        ).blocks[0].number;
        const last24hBlockNumber = (
          await blockNumberGraphQLClient.request(last24hBlockNumberQuery)
        ).blocks[0].number;


        // get total volume
        const tradeVolumeQuery = gql`
            {
              protocolMetrics(block:{number:${blockNumber}}){
                totalVolume
              }
            }
          `;

        // get total volume 24 hours ago
        const lastTradeVolumeQuery = gql`
          {
            protocolMetrics(block:{number:${last24hBlockNumber}}){
              totalVolume
            }
          }
        `;


        let tradeVolume = (
          await graphQLClient.request(tradeVolumeQuery)
        ).protocolMetrics[0].totalVolume

        let last24hTradeVolume = (
          await graphQLClient.request(lastTradeVolumeQuery)
        ).protocolMetrics[0].totalVolume

        const totalVolume = Number(tradeVolume) / 10 ** 6
        const dailyVolume = (Number(tradeVolume) - Number(last24hTradeVolume)) / 10 ** 6

        return {
          timestamp,
          totalVolume: totalVolume.toString(),
          dailyVolume: dailyVolume.toString(),
        };
      }


      return {
        timestamp,
        totalVolume: "0",
        dailyVolume: "0",
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1700323200,
    },
  },
};

export default adapter;
