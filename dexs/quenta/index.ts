import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import type { FetchOptions } from "../../adapters/types";


const endpoints = {
  [CHAIN.IOTEX]: "https://gql.quenta.io/subgraphs/name/iotex/quenta"
};

async function fetch({ getFromBlock, getToBlock, chain, }: FetchOptions) {
  const fromBlock = await getFromBlock()
  const toBlock = await getToBlock()

  const graphQLClient = new GraphQLClient(endpoints[chain]);
  // get total volume
  const tradeVolumeQuery = `
            {
              protocolMetrics(block:{number:${toBlock}}){
                totalVolume
              }
            }
          `;

  // get total volume 24 hours ago
  const lastTradeVolumeQuery = `
          {
            protocolMetrics(block:{number:${fromBlock}}){
              totalVolume
            }
          }
        `;


  let { protocolMetrics: [{ totalVolume }] } = await graphQLClient.request(tradeVolumeQuery)
  let { protocolMetrics: [{ totalVolume: totalVolumePast }] } = await graphQLClient.request(lastTradeVolumeQuery)

  totalVolume = totalVolume / 1e6
  totalVolumePast = totalVolumePast / 1e6
  return {
    dailyVolume: totalVolume - totalVolumePast,
  };
}


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
    },
  },
};

export default adapter;
