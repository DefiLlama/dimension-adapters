import * as sdk from "@defillama/sdk";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";


const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('HETFHppem3dz1Yjjv53D7K98dm5t5TErgYAMPBFPHVpi'),
  [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta"
};

const blockNumberGraph = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('64DCU8nq48qdDABnobpDafsg7RF75Rx5soKrHiGA8mqp'),
  [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta-blocks"
}

const headers = { 'sex-dev': 'ServerDev' } as any

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
        headers: chain === CHAIN.ZETA ? headers : null,
      });
      const graphQLClient = new GraphQLClient(graphUrls[chain], {
        headers: chain === CHAIN.ZETA ? headers : null,
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
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM) as any,
      start: '2023-11-18',
    },
    [CHAIN.ZETA]: {
      fetch: graphs(endpoints)(CHAIN.ZETA) as any,
    },
  },
};

export default adapter;
