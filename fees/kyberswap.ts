import { BaseAdapter, BreakdownAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";



type TEndpoint = {
  [k: string | Chain]: string;
}

type IGraph = (chain: Chain) => (timestamp: number) => Promise<FetchResultFees>;
const normalizeChain = {
  [CHAIN.AVAX]: "avalanche"
} as {[c:string]:string}


const elasticChains = [
  CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.BSC, CHAIN.AVAX, CHAIN.FANTOM, CHAIN.ARBITRUM, CHAIN.OPTIMISM
]

const elasticEndpoints: TEndpoint = elasticChains.reduce((acc, chain)=>({
    [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-${normalizeChain[chain]??chain}`,
    ...acc,
}), {
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet",
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-one",
    [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-matic"
} as any);

const classicEndpoints: TEndpoint = [...elasticChains, "aurora"].reduce((acc, chain)=>({
  [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-exchange-${normalizeChain[chain]??chain}`,
  ...acc,
}), {
  cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-cronos",
  arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-arbitrum",
} as any);

const graphsElastic = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

    const graphQuery = gql
    `{
      kyberSwapDayData(id: ${dateId}) {
        feesUSD
      }
    }`;

    const graphRes = await request(elasticEndpoints[chain], graphQuery);
    const dailyFee = new BigNumber(graphRes.kyberSwapDayData.feesUSD);
    const dailyRev = dailyFee.multipliedBy(0.1)

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyRev.toString(),
    };
  };
};

interface IPoolData {
  date: number;
  dailyFeeUSD: string;
}
const graphsClassic = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const graphQuery = gql
    `
      {
        poolDayDatas(first:1000) {
          date
          dailyFeeUSD
        }
      }
    `;

    const graphRes: IPoolData[] = (await request(classicEndpoints[chain], graphQuery)).poolDayDatas;
    const dailyFeeUSD = graphRes.find(e => Number(e.date) === todayTimestamp)
    const dailyFee = new BigNumber(dailyFeeUSD?.dailyFeeUSD || '0');
    const dailyRev = dailyFee.multipliedBy(0.1)

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyRev.toString(),
    };
  };
};



function buildFromEndpoints(endpoints: TEndpoint, graphql: IGraph, volumeField: string, dailyDataField: string) {
  return Object.keys(endpoints).reduce((acc: any, chain: any) => {
      acc[chain] = {
        fetch: graphql(chain),
        start: getStartTimestamp({
          endpoints: endpoints,
          chain: chain,
          volumeField,
          dailyDataField
        })
      }
      return acc
    }, {} as BaseAdapter)
}

const adapter: BreakdownAdapter = {
  breakdown: {
    classic: buildFromEndpoints(classicEndpoints, graphsClassic, "dailyVolumeUSD", "dmmDayDatas"),
    elastic: buildFromEndpoints(elasticEndpoints, graphsElastic, "volumeUSD", "kyberSwapDayDatas")
  }
}

export default adapter;
