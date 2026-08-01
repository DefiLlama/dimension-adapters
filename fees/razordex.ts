import { Adapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { GraphQLClient } from 'graphql-request';
import {request, gql} from "graphql-request"

const graphQLClient = new GraphQLClient("https://api.razordex.xyz/graphql", {
    headers: {
      'Content-Type': 'application/json',
    },
  });


async function fetch() {
    const query = gql`
        query Stats {
            defiLlamaStats {
                dailyVolumeMove
                dailyFeeMove
            }
        }
    `
    const response = await graphQLClient.request(query);
    const { defiLlamaStats } = response
    return {
        dailyFees: defiLlamaStats.dailyFeeMove,
        dailyVolume: defiLlamaStats.dailyVolumeMove,
    }
}


const adapter: Adapter = {
    adapter: {
        [CHAIN.MOVE]: {
            fetch,
            runAtCurrTime: true
        }
    },
    version: 2
}

export default adapter;

