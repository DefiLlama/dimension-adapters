import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "../../adapters/types";


const endpoints = {
  [CHAIN.ARBITRUM]: "https://gql.substancex.io/subgraphs/name/substanceexchangedevelop/coreprod",
  [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta"
};

const blockNumberGraph = {
  [CHAIN.ARBITRUM]: "https://gql.substancex.io/subgraphs/name/substanceexchangedevelop/blocks",
  [CHAIN.ZETA]: "https://gql-zeta.substancex.io/subgraphs/name/substanceexchangedevelop/zeta-blocks"
}

const headers = { 'sex-dev': 'ServerDev' } as any

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const toTimestamp = options.toTimestamp;

  // Get blockNumers
  const blockNumerQuery = gql`
    {
            blocks(
              where: {timestamp_lte:${options.toTimestamp}}
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
              where: {timestamp_lte:${options.toTimestamp - 24 * 60 * 60}}
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
        headers: chain === CHAIN.ZETA ? headers : headers,
      });
      const graphQLClient = new GraphQLClient(endpoints[chain], {
        headers: chain === CHAIN.ZETA ? headers : headers,
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
        await graphQLClient.request(tradeVolumeQuery, { headers })
      ).protocolMetrics[0].totalVolume

      let last24hTradeVolume = (
        await graphQLClient.request(lastTradeVolumeQuery, { headers })
      ).protocolMetrics[0].totalVolume

      const dailyVolume = (Number(tradeVolume) - Number(last24hTradeVolume)) / 10 ** 6

      return {
        dailyVolume: dailyVolume.toString(),
      };
    }


const adapter: Adapter = {
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2023-11-18',
    },
    [CHAIN.ZETA]: {
    },
  },
  deadFrom: "2025-10-11",
};

export default adapter;
