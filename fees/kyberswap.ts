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
} as { [c: string]: string }


const elasticChains = [
  CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.BSC, CHAIN.AVAX, CHAIN.FANTOM, CHAIN.ARBITRUM, CHAIN.OPTIMISM
]

const elasticEndpoints: TEndpoint = elasticChains.reduce((acc, chain) => ({
  [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-${normalizeChain[chain] ?? chain}`,
  ...acc,
}), {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-one",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-matic"
} as any);

const classicEndpoints: TEndpoint = [...elasticChains, "aurora"].reduce((acc, chain) => ({
  [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-exchange-${normalizeChain[chain] ?? chain}`,
  ...acc,
}), {
  cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-cronos",
  arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-arbitrum",
} as any);

const methodology = {
  elastic: {
    UserFees: "Users pay trading fees based pool fee setting: 0.008%, 0.01%, 0.04%, 0.3% and 1%",
    Fees: "Each pool can have different fees set from the following tires: 0.008%, 0.01%, 0.04%, 0.3% and 1%",
    Revenue: "Currently 100% of the dao rewards (10% of the collected fees) goes to all voters (KNC stakers)",
    ProtocolRevenue: "Treasury have no revenue",
    HoldersRevenue: "Holders who stake and participate in the KyberDAO get their share of the fees designated for rewards, currently set at 10% of trading fees",
    SupplySideRevenue: "Liquidity providers earn 90% fees of trading routed through their pool and selected price range"
  },
  classic: {
    UserFees: "Users pay a dynamic fee based on market conditions",
    Fees: "Kyberswap Classic collects a dynamic fee that increases with market volatility and decreases with stable market conditions",
    Revenue: "Currently 100% of the dao rewards (10% of the collected fees) goes to all voters (KNC stakers)",
    ProtocolRevenue: "Treasury have no revenue",
    HoldersRevenue: "Holders who stake and participate in the KyberDAO get their share of the fees designated for rewards, currently set at 10% of trading fees",
    SupplySideRevenue: "Liquidity providers earn 90% fees of trading routed through their pool and selected price range"
  }
}

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

    return {
      timestamp,
      dailyUserFees: dailyFee.toString(),
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.1).toString(),
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: dailyFee.multipliedBy(0.1).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.9).toString(),
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
    const dailyFee = dailyFeeUSD?.dailyFeeUSD ? new BigNumber(dailyFeeUSD.dailyFeeUSD) : undefined
    if (dailyFee === undefined) return { timestamp }

    return {
      timestamp,
      dailyUserFees: dailyFee.toString(),
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.1).toString(),
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: dailyFee.multipliedBy(0.1).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.9).toString(),
    };
  };
};



const buildFromEndpoints = (type: "elastic" | "classic") => function (endpoints: TEndpoint, graphql: IGraph, volumeField: string, dailyDataField: string) {
  return Object.keys(endpoints).reduce((acc: any, chain: any) => {
    acc[chain] = {
      fetch: graphql(chain),
      start: getStartTimestamp({
        endpoints: endpoints,
        chain: chain,
        volumeField,
        dailyDataField
      }),
      meta: {
        methodology: methodology[type]
      }
    }
    return acc
  }, {} as BaseAdapter)
}

const adapter: BreakdownAdapter = {
  breakdown: {
    classic: buildFromEndpoints("classic")(classicEndpoints, graphsClassic, "dailyVolumeUSD", "dmmDayDatas"),
    elastic: buildFromEndpoints("elastic")(elasticEndpoints, graphsElastic, "volumeUSD", "kyberSwapDayDatas")
  }
}

export default adapter;
