import * as sdk from "@defillama/sdk";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";


const endpoints = {
  [CHAIN.IOTEX]: "https://gql.quenta.io/subgraphs/name/iotex/quenta"
};

const blockNumberGraph = {
  [CHAIN.IOTEX]: "https://graph.mainnet.iotex.io/subgraphs/name/quenta/blocks" 
}

const headers = { 'sex-dev': 'ServerDev'}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {

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

        const blockNumberGraphQLClient = new GraphQLClient(blockNumberGraph[chain], {
          headers: chain === CHAIN.ZETA ? headers: null,
        });
        const graphQLClient = new GraphQLClient(graphUrls[chain], {
          headers: chain === CHAIN.ZETA ? headers: null,
        });


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


const adapter: Adapter = {
  adapter: {

    [CHAIN.IOTEX]: {
      fetch: graphs(endpoints)(CHAIN.IOTEX),
      start: 29643703,
    }, 
  },
};

export default adapter;
