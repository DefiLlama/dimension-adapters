import * as sdk from "@defillama/sdk";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { Chain } from "../../adapters/types";


const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('HETFHppem3dz1Yjjv53D7K98dm5t5TErgYAMPBFPHVpi'),
  [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta"
};

const blockNumberGraph = {
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('64DCU8nq48qdDABnobpDafsg7RF75Rx5soKrHiGA8mqp'),
    [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta-blocks" 
}

const headers = { 'sex-dev': 'ServerDev'} as any

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ toTimestamp }: FetchOptions) => {

        // Get blockNumers
        const blockNumerQuery = gql`
        {
            blocks(
              where: {timestamp_lte:${toTimestamp}}
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
              where: {timestamp_lte:${toTimestamp - 24 * 60 * 60}}
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


        // get total fee
        const totalFeeQuery = gql`
            {
              protocolMetrics(block:{number:${blockNumber}}){
                totalFee
              }
            }
          `;

        // get total fee 24 hours ago
        const last24hTotalFeeQuery = gql`
          {
            protocolMetrics(block:{number:${last24hBlockNumber}}){
                totalFee
            }
          }
        `;
          

        let totalFee = (
          await graphQLClient.request(totalFeeQuery)
        ).protocolMetrics[0].totalFee

        let last24hTotalFee = (
          await graphQLClient.request(last24hTotalFeeQuery)
        ).protocolMetrics[0].totalFee

        totalFee = Number(totalFee) / 10 ** 6
        const dailyFee = Number(totalFee) - (Number(last24hTotalFee) / 10 ** 6)

        return {
          dailyFees: dailyFee.toString(),
        };
      }

    };
};

const adapter: Adapter = {
  version: 2,
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
