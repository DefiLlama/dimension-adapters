import * as sdk from "@defillama/sdk";
import { Chain, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

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
  revenueUSD: string
  feeUSD: string
}
interface IResponse {
  today: IPool[]
  yesterday: IPool[]
}
const feesQuery = gql`
  query fees($toBlock: Int!, $fromBlock: Int!) {
    today: pools(block: {number: $toBlock}) {
      id
      revenueUSD,
      feeUSD
    }
    yesterday: pools(block: {number: $fromBlock}) {
      id
      revenueUSD,
      feeUSD
    }
  }
`

const fetch = async (options: FetchOptions) => {
  const endpoint = endpoints[options.chain];
  const toBlock = await options.getToBlock();
  const fromBlock = await options.getFromBlock();

  const response: IResponse = (await request(endpoint, feesQuery, {
    toBlock,
    fromBlock
  }));

  const dailyFees = response.today.reduce((acc, pool) => {
    const id = response.yesterday.find((p) => p.id === pool.id)
    if (!id) return acc
    return acc + Number(pool.feeUSD) - Number(id.feeUSD);
  }, 0);  
  const dailyRevenue = response.today.reduce((acc, pool) => {
    const id = response.yesterday.find((p) => p.id === pool.id)
    if (!id) return acc
    return acc + Number(pool.revenueUSD) - Number(id.revenueUSD);
  },0);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const fetchPolygon = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // 10000
  const logs = await options.getLogs({
    target: "0x2370cB1278c948b606f789D2E5Ce0B41E90a756f", // 0.5%
    eventAbi:
      "event CoveSwapped(address indexed inAsset,address indexed outAsset,address indexed recipient,uint256 inAmount,uint256 outAmount,bytes32 auxiliaryData)",
  });

  const logs_2 = await options.getLogs({
    target: "0x6bfce69d1df30fd2b2c8e478edec9daa643ae3b8",
    eventAbi:
      "event Swapped(address indexed inAsset,address indexed outAsset,address indexed recipient,uint256 inAmount,uint256 outAmount,bytes auxiliaryData)",
  });

  logs.forEach((log) => {
    dailyVolume.add(log.outAsset, log.outAmount)
    dailyFees.add(log.outAsset, Number(log.outAmount) * (5/10000))
  });

  logs_2.forEach((log) => {
    dailyVolume.add(log.outAsset, log.outAmount)
  });

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-08-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2022-06-29',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolygon,
      start: '2022-04-20',
    },
    // [CHAIN.MOONBEAM]: {
    //   fetch,
    //   start: '2022-08-05',
    // },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-08-02',
    }
  }
}

export default adapters;
