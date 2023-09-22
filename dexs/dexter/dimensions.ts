const {GraphQLClient, gql} = require('graphql-request');
import {dexterSubgraphEndpoint, dexterVaultAddr} from "./constants";

const operation = gql`
    query defillama_dex_dimensions {
      pool_daily_aggregate {
        total_volume
      }
    }
`;

interface OperationResponse {
  pool_daily_aggregate: [{
    total_volume: number
  }];
}

export interface IDimensions {
  totalVolume?: number
  dailyVolume: number | undefined
}

export const getDimensions = async (_: string) => {
  const graphQLClient = new GraphQLClient(dexterSubgraphEndpoint);
  const res = (await graphQLClient.request(operation)) as OperationResponse;
  const dailyVolume = res.pool_daily_aggregate.reduce((acc, {total_volume}) => acc + total_volume, 0);

  return {
    dailyVolume: dailyVolume
  }
}
