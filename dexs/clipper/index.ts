import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
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
  id: string
  volumeUSD: string
}
interface IDailyPoolStatus {
  volumeUSD: string
}
interface IResponse {
  today: IPool[]
  yesterday: IPool[]
}
const feesQuery = gql`
  query fees($fromBlock: Int!, $toBlock: Int!) {
    today:pools(block: {number: $toBlock}) {
      id
      volumeUSD
    }
    yesterday:pools(block: {number: $fromBlock}) {
      id
      volumeUSD
    }
  }
`

const fetchFees = (chain: Chain) => {
  return async (_t: number, _b: any, options: FetchOptions) => {
    const endpoint = endpoints[chain];
    const toBlock = await options.getToBlock()
    const fromBlock = await options.getFromBlock()

    const response: IResponse = (await request(endpoint, feesQuery, {
      fromBlock: fromBlock,
      toBlock: toBlock
    }));

    const dailyVolume = response.today.reduce((acc, pool) => { 
      const id = response.yesterday.find((p) => p.id === pool.id)
      if (!id) return acc
      return acc + Number(pool.volumeUSD) - Number(id.volumeUSD);
    }, 0);
    const totalVolume = response.today.reduce((acc, pool) => {  
      return acc + Number(pool.volumeUSD);
    }, 0);
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
