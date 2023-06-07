const {GraphQLClient, gql} = require('graphql-request');
import {dexterSubgraphEndpoint, dexterVaultAddr} from "./constants";

const operation = gql`
    query defillama_dex_dimensions($vault: String, $date: date) {
        totalVolume: pool_daily_closing_data_aggregate(where: {vault_address: {_eq: $vault}}) {
            aggregate {
                sum {
                    swap_volume
                }
            }
        }
        dailyVolume: pool_daily_closing_data_aggregate(where: {vault_address: {_eq: $vault}, date: {_eq: $date}}) {
            aggregate {
                sum {
                    swap_volume
                }
            }
        }
    }
`;

interface OperationResponse {
  totalVolume: {
    aggregate: {
      sum: {
        swap_volume: number | null
      }
    }
  },
  dailyVolume: {
    aggregate: {
      sum: {
        swap_volume: number | null
      }
    }
  }
}

export interface IDimensions {
  totalVolume: number
  dailyVolume: number | undefined
}

export const getDimensions = async (date: string) => {
  const graphQLClient = new GraphQLClient(dexterSubgraphEndpoint);
  const res = (await graphQLClient.request(operation, {
    "vault": dexterVaultAddr,
    "date": date
  })) as OperationResponse;

  return {
    totalVolume: res.totalVolume.aggregate.sum.swap_volume || 0,
    dailyVolume: res.dailyVolume.aggregate.sum.swap_volume || undefined
  }
}