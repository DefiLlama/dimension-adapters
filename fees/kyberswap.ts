import * as sdk from "@defillama/sdk";
import { BaseAdapter, BreakdownAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { Chain } from  "../adapters/types";
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
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('4U9PxDR4asVvfXyoVy18fhuj6NHnQhLzZkjZ5Bmuc5xk'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('C36tj8jSpEHxcNbjM3z7ayUZHVjrk4HRqnpGMFuRgXs6'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('8g4tJKCJ7eMAHjzZNeRWz9BkYG5U7vDNjdanSXfDXGXT'),
  [CHAIN.LINEA]: "https://linea-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-linea",
  [CHAIN.BITTORRENT]: "https://bttc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bttc",
  [CHAIN.BASE]: "https://base-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-base",
  [CHAIN.SCROLL]: "https://scroll-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-scroll"
  // [CHAIN.CRONOS]: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos",
  // [CHAIN.VELAS]: "https://velas-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-velas",
  // [CHAIN.OASIS]: "https://oasis-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-oasis",
} as any);

const elasticEndpointsV2: TEndpoint =  {
  [CHAIN.ETHEREUM]: "https://ethereum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-ethereum-legacy",
  [CHAIN.BSC]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
  [CHAIN.POLYGON]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
  [CHAIN.AVAX]: "https://avalanche-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-avalanche-legacy",
  [CHAIN.ARBITRUM]: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-legacy",
  [CHAIN.OPTIMISM]: "https://optimism-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-optimism-legacy",
  [CHAIN.FANTOM]: "https://fantom-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-fantom-legacy",
  [CHAIN.BITTORRENT]: "https://bttc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bttc-legacy",
  [CHAIN.CRONOS]: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos-legacy",
  // [CHAIN.VELAS]: "https://velas-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-velas-legacy",
  // [CHAIN.OASIS]: "https://oasis-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-oasis-legacy",
};


const classicEndpoints: TEndpoint = [...elasticChains, "aurora"].reduce((acc, chain) => ({
  [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-exchange-${normalizeChain[chain] ?? chain}`,
  ...acc,
}), {
  cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-cronos",
  arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-arbitrum",
  [CHAIN.ERA]: "https://zksync-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-zksync",
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/kybernetwork/kyberswap-classic-linea",
  [CHAIN.POLYGON_ZKEVM]: "https://polygon-zkevm-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-polygon-zkevm",
  [CHAIN.BITTORRENT]: "https://bttc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-bttc",
  [CHAIN.SCROLL]: "https://scroll-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-scroll"
} as any);

interface IData {
  feesUSD: string;
  volumeUSD: string;
  date: number;
  dailyFeeUSD: string;
  tvlUSD: string;
}
interface IPoolDay {
  poolDayDatas: IData[]
}

const graphsElasticV2 = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

      const graphQuery = gql
      `{
        poolDayDatas(frist: 1000, where:{date:${todayTimestamp},tvlUSD_gt: 1000},orderBy:feesUSD, orderDirection: desc) {
          feesUSD
        }
    }`;

    if (!elasticEndpointsV2[chain]) return { timestamp };
    try {
      const graphRes: IPoolDay = await request(elasticEndpointsV2[chain], graphQuery);
      const dailyFee = new BigNumber(graphRes.poolDayDatas.reduce((a: number, b: IData) => a + Number(b.feesUSD), 0))
      return {
        timestamp,
        dailyUserFees: dailyFee.toString(),
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.multipliedBy(0.16).toString(),
        dailyProtocolRevenue: "0",
        dailyHoldersRevenue: dailyFee.multipliedBy(0.16).toString(),
        dailySupplySideRevenue: dailyFee.multipliedBy(0.84).toString(),
      };
    } catch (e) {
      return { timestamp };
    }
  };
};

const graphsElastic = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

    const graphQuery =
      `{
        poolDayDatas(frist: 1000, where:{date:${todayTimestamp},tvlUSD_gt: 1000},orderBy:feesUSD, orderDirection: desc) {
          feesUSD
        }
    }`;
    const graphRes: IPoolDay = await request(elasticEndpoints[chain], graphQuery);
    const elasticV2 = (await graphsElasticV2(chain)(timestamp))
    const dailyFee = graphRes.poolDayDatas
      .filter(e => Number(e?.dailyFeeUSD || 0) < 100_000 && Number(e?.feesUSD || 0) < 100_000)
      .reduce((a: number, b: IData) => a + Number(b?.feesUSD || 0) + Number(b?.dailyFeeUSD || 0), 0)
      + Number(elasticV2?.dailyFees || 0)

    return {
      timestamp,
      dailyUserFees: dailyFee.toString(),
      dailyFees: dailyFee.toString(),
      dailyRevenue: (dailyFee * 0.16).toString(),
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: (dailyFee * 0.16).toString(),
      dailySupplySideRevenue: (dailyFee * 0.84).toString(),
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
    const fromTimestamp = todayTimestamp - 60 * 60 * 24
    const toTimestamp = todayTimestamp
    const graphQuery = gql
      `
      {
        poolDayDatas(
          first:1000
          orderBy:dailyFeeUSD
          orderDirection: desc
          where: {
            date_gte: ${fromTimestamp}
            date_lte: ${toTimestamp}
            dailyFeeUSD_gt:0
          }
        ) {
          date
          dailyFeeUSD
        }
      }
    `;
    try {

    const graphRes: IPoolData[] = (await request(classicEndpoints[chain], graphQuery)).poolDayDatas;
    const dailyFeeUSD = graphRes.reduce((a: number, b: IPoolData) => a + Number(b.dailyFeeUSD), 0)
    const dailyFee = new BigNumber(dailyFeeUSD)
    if (dailyFee === undefined) return { timestamp }

    return {
      timestamp,
      dailyUserFees: dailyFee.toString(),
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.16).toString(),
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: dailyFee.multipliedBy(0.16).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.84).toString(),
    };
    } catch (e) {
      return { timestamp }
    }
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
    }
    return acc
  }, {} as BaseAdapter)
}

const adapter: BreakdownAdapter = {
  deadFrom: '2025-01-01',
  breakdown: {
    classic: buildFromEndpoints("classic")(classicEndpoints, graphsClassic, "dailyVolumeUSD", "dmmDayDatas"),
    elastic: buildFromEndpoints("elastic")(elasticEndpoints, graphsElastic, "volumeUSD", "kyberSwapDayDatas")
  }
}

export default adapter;
