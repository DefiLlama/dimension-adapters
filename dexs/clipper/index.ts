import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

type TEndpoint = {
  [key in Chain]: string
}

const endpoints: TEndpoint = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('2BhN8mygHMmRkceMmod7CEEsGkcxh91ExRbEfRVkpVGM'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Cu6atAfi6uR9mLMEBBjkhKSUUXHCobbB83ctdooexQ9f'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('Brmf2gRdpLFsEF6YjSAMVrXqSfbhsaaWaWzdCYjE7iYY'),
  // [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('8zRk4WV9vUU79is2tYGWq9GKh97f93LsZ8V9wy1jSMvA'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ATBQPRjT28GEK6UaBAzXy64x9kFkNk1r64CdgmDJ587W'),
};

interface IPool {
  volumeUSD: string
}
interface IDailyPoolStatus {
  volumeUSD: string
}
interface IResponse {
  pools: IPool[]
  dailyPoolStatuses: IDailyPoolStatus[]
}
const feesQuery = gql`
  query fees($fromTimestamp: Int!, $toTimestamp: Int!, $blockNumber: Int!) {
    pools(first: 5, block: {number: $blockNumber}) {
      volumeUSD
    }
    dailyPoolStatuses(orderBy: volumeUSD, orderDirection: desc, where: {from_gte: $fromTimestamp, from_lte: $toTimestamp}) {
      volumeUSD
    }
  }
`

const fetchFees = (chain: Chain) => {
  return async (_t: number, _b: any, options: FetchOptions) => {
    const endpoint = endpoints[chain];
    const toBlock = await options.getToBlock()

    const response: IResponse = (await request(endpoint, feesQuery, {
      fromTimestamp: options.startTimestamp,
      toTimestamp: options.endTimestamp,
      blockNumber: toBlock
    }));

    const dailyVolume = response.dailyPoolStatuses.reduce((acc, pool) => {
      return acc + Number(pool.volumeUSD);
    }, 0);
    const totalVolume = response.pools.reduce((acc, pool) => {
      return acc + Number(pool.volumeUSD);
    },0);

    return {
      dailyVolume,
      totalVolume,
    }
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: '2022-08-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: '2022-06-29',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: '2022-04-20',
    },
    // [CHAIN.MOONBEAM]: {
    //   fetch: fetchFees(CHAIN.MOONBEAM),
    //   start: '2022-08-05',
    // },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: '2023-08-02',
    }
  }
}

export default adapters;
