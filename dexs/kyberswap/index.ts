import * as sdk from "@defillama/sdk";
import ADDRESSES from '../../helpers/coreAssets.json'
import request from "graphql-request";
import { BaseAdapter, BreakdownAdapter, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
  univ2Adapter,
  getUniqStartOfTodayTimestamp,
} from "../../helpers/getUniSubgraphVolume";
import { Chain } from "../../adapters/types";

const normalizeChain = {
    "avax": "avalanche"
} as {[c:string]:string}

const kyberswapElasticV2fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ETHEREUM]: "https://ethereum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-ethereum-legacy",
    [CHAIN.BSC]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
    [CHAIN.POLYGON]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
    [CHAIN.AVAX]: "https://avalanche-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-avalanche-legacy",
    [CHAIN.ARBITRUM]: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-legacy",
    [CHAIN.OPTIMISM]: "https://optimism-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-optimism-legacy",
    [CHAIN.FANTOM]: "https://fantom-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-fantom-legacy",
    [CHAIN.BITTORRENT]: "https://bttc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bttc-legacy",
    [CHAIN.CRONOS]: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos-legacy",
    [CHAIN.VELAS]: "https://velas-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-velas-legacy",
    [CHAIN.OASIS]: "https://oasis-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-oasis-legacy",
  },
  factoriesName: "factories",
  dayData: "kyberSwapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

const kyberswapElasticV2: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {fetch: kyberswapElasticV2fetch, start: 1654905600},
    [CHAIN.BSC]: {fetch: kyberswapElasticV2fetch, start: 1654732800},
    [CHAIN.POLYGON]: {fetch: kyberswapElasticV2fetch, start: 1654732800},
    [CHAIN.AVAX]: {fetch: kyberswapElasticV2fetch, start: 1654905600},
    [CHAIN.ARBITRUM]: {fetch: kyberswapElasticV2fetch, start: 1655942400},
    [CHAIN.OPTIMISM]: {fetch: kyberswapElasticV2fetch, start: 1656460800},
    [CHAIN.FANTOM]: {fetch: kyberswapElasticV2fetch, start: 1654732800},
    [CHAIN.BITTORRENT]: {fetch: kyberswapElasticV2fetch, start: 1658188800},
    [CHAIN.CRONOS]: {fetch: kyberswapElasticV2fetch, start: 1660780800},
    [CHAIN.VELAS]: {fetch: kyberswapElasticV2fetch, start: 1660780800},
    [CHAIN.OASIS]: {fetch: kyberswapElasticV2fetch, start: 1660780800},
  }
}

// velas, oasis & bittorrent missing
const elasticChains = ["ethereum", "polygon", "bsc", "avax", "fantom", "arbitrum", "optimism"]

const elasticEndpoints = elasticChains.reduce((acc, chain)=>({
    [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-${normalizeChain[chain]??chain}`,
    ...acc,
}), {
    //cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos", // missing -> almost no volume and stale
    ethereum: sdk.graph.modifyEndpoint('4U9PxDR4asVvfXyoVy18fhuj6NHnQhLzZkjZ5Bmuc5xk'),
    arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum",
    polygon: sdk.graph.modifyEndpoint('8g4tJKCJ7eMAHjzZNeRWz9BkYG5U7vDNjdanSXfDXGXT'),
    [CHAIN.LINEA]: "https://linea-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-linea",
    [CHAIN.BASE]: "https://base-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-base",
    [CHAIN.SCROLL]: "https://scroll-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-scroll"
} as any);
elasticEndpoints.fantom = "https://fantom-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-fantom"


const elasticGraphs = getChainVolume({
    graphUrls: elasticEndpoints,
    totalVolume: {
      factory: "factories",
      field: DEFAULT_TOTAL_VOLUME_FIELD,
    },
    dailyVolume: {
      factory: "kyberSwapDayData",
      field: "volumeUSD",
    },
});

interface IPoolDayData {
  pool: {
    id: string
    token0: {
      id: string
      symbol: string
    }
    token1: {
      id: string
      symbol: string
    }
  }
  volumeUSD: string
  tvlUSD: string
  date: number
}

const optimismElastic = async (timestamp: number) => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = sdk.graph.modifyEndpoint('3Kpd8i7U94pTz3Mgdb8hyvT5o26fpwT7SUHAbTa6JzfZ');
  const blacklisted = [
    '0xa00e3a3511aac35ca78530c85007afcd31753819',
    ADDRESSES.optimism.sUSD,
    '0xb448ec505c924944ca8b2c55ef05c299ee0781df'
  ]
  const poolBlacklist = [
    '0x128944d0c53f407491e8bd543ae4f0b455b389ed'
  ]

  const query = `{
    poolDayDatas(first: 1000, where:{date:${todayTimestamp},tvlUSD_gt:1000}, orderBy: volumeUSD, orderDirection:desc) {
      pool {
        id
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      volumeUSD
      tvlUSD
      date
    }
  }`;
  const response: IPoolDayData[] = (await request(url, query)).poolDayDatas;
  const volumeUSD = response
    .filter((pool) => !blacklisted.includes(pool.pool.token0.id) && !blacklisted.includes(pool.pool.token1.id) && !poolBlacklist.includes(pool.pool.id))
    .reduce((acc, pool) => {
      const volume = Number(pool.volumeUSD)
      return acc + volume
    }, 0);
  const dailyVolume = volumeUSD;

  return {
    dailyVolume: dailyVolume.toString(),
  }
}

const ethereumElasicVolume = async (timestamp: number) => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = sdk.graph.modifyEndpoint('4U9PxDR4asVvfXyoVy18fhuj6NHnQhLzZkjZ5Bmuc5xk');

  const blacklisted = [
    '0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202',
  ]
  const query = `{
    poolDayDatas(first: 1000, where:{date:${todayTimestamp},tvlUSD_gt:1000}, orderBy: volumeUSD, orderDirection:desc) {
      pool {
        id
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      volumeUSD
      tvlUSD
      date
    }
  }`;
  const response: IPoolDayData[] = (await request(url, query)).poolDayDatas;
  const volumeUSD = response
    .filter((pool) => !blacklisted.includes(pool.pool.token0.id) && !blacklisted.includes(pool.pool.token1.id))
    .reduce((acc, pool) => {
      const volume = Number(pool.volumeUSD)
      return acc + volume
    }, 0);
  const dailyVolume = volumeUSD;

  return {
    dailyVolume: dailyVolume.toString(),
  }
}

const classicEndpoints = [...elasticChains].reduce((acc, chain)=>({
    [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-exchange-${normalizeChain[chain]??chain}`,
    ...acc,
}), {
    // cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-cronos",
    arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-arbitrum",
    [CHAIN.ERA]: "https://zksync-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-zksync",
    [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/kybernetwork/kyberswap-classic-linea",
    [CHAIN.SCROLL]: "https://scroll-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-scroll"
} as any);

const classicGraphs = getChainVolume({
  graphUrls: classicEndpoints,
  totalVolume: {
    factory: "dmmFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dmmDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const customeElasicVolumeFunctions: {[s: Chain]: any} = {
  [CHAIN.OPTIMISM]: optimismElastic,
  [CHAIN.ETHEREUM]: ethereumElasicVolume
}
function buildFromEndpoints(endpoints: typeof classicEndpoints, graphs: typeof classicGraphs, _volumeField:string, _dailyDataField:string, isElastic: boolean){
    return Object.keys(endpoints).reduce((acc, chain) => {
        acc[chain] = {
        fetch: async (options: FetchOptions) =>  {
            const a = (customeElasicVolumeFunctions[chain] !== undefined) && isElastic  ? await customeElasicVolumeFunctions[chain](options.endTimestamp) : (await (graphs as any)(chain as any)(options))
            const elasticV2 = ((kyberswapElasticV2 as BaseAdapter)[chain as Chain]?.fetch != undefined && isElastic) ? (await (kyberswapElasticV2 as any)[chain as Chain]?.fetch(options as any, {}, options)) : {} as FetchResultVolume;
            const dailyVolume = Number(a?.dailyVolume || 0) + Number(elasticV2?.dailyVolume || 0)
            return {
              dailyVolume: dailyVolume.toString(),
            };
          },
        }
        return acc
      }, {} as BaseAdapter)
}

const adapter: BreakdownAdapter = {
  version: 2,
  deadFrom: '2025-01-01',
  breakdown: {
    classic: buildFromEndpoints(classicEndpoints, classicGraphs, DEFAULT_DAILY_VOLUME_FIELD, "dmmDayDatas", false),
    elastic: buildFromEndpoints(elasticEndpoints, elasticGraphs, "volumeUSD", "kyberSwapDayDatas", true)
  }
}

export default adapter;