import { BaseAdapter, BreakdownAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
  univ2Adapter,
} from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";

const normalizeChain = {
    "avax": "avalanche"
} as {[c:string]:string}

const kyberswapElasticV2 = univ2Adapter({
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
}, {
  factoriesName: "factories",
  dayData: "kyberSwapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

kyberswapElasticV2.adapter.ethereum.start = async () => 1654905600;
kyberswapElasticV2.adapter.bsc.start = async () => 1654732800;
kyberswapElasticV2.adapter.polygon.start = async () => 1654732800;
kyberswapElasticV2.adapter.avax.start = async () => 1654905600;
kyberswapElasticV2.adapter.arbitrum.start = async () => 1655942400;
kyberswapElasticV2.adapter.optimism.start = async () => 1656460800;
kyberswapElasticV2.adapter.fantom.start = async () => 1654732800;
kyberswapElasticV2.adapter.bittorrent.start = async () => 1658188800;
kyberswapElasticV2.adapter.oasis.start = async () => 1660780800;
kyberswapElasticV2.adapter.cronos.start = async () => 1660780800;

// velas, oasis & bittorrent missing
const elasticChains = ["ethereum", "polygon", "bsc", "avax", "fantom", "arbitrum", "optimism"]

const elasticEndpoints = elasticChains.reduce((acc, chain)=>({
    [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-${normalizeChain[chain]??chain}`,
    ...acc,
}), {
    //cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos", // missing -> almost no volume and stale
    ethereum: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet",
    arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum",
    polygon: "https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-matic",
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

const classicEndpoints = [...elasticChains, "aurora"].reduce((acc, chain)=>({
    [chain]: `https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-exchange-${normalizeChain[chain]??chain}`,
    ...acc,
}), {
    cronos: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-cronos",
    arbitrum: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-exchange-arbitrum",
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

function buildFromEndpoints(endpoints: typeof classicEndpoints, graphs: typeof classicGraphs, volumeField:string, dailyDataField:string, isElastic: boolean){
    return Object.keys(endpoints).reduce((acc, chain) => {
        acc[chain] = {
        fetch: async (timestamp: number) =>  {
            const a = (await graphs(chain as any)(timestamp, {}))
            const elasticV2 = (kyberswapElasticV2.adapter[chain as Chain]?.fetch != undefined && isElastic) ? (await kyberswapElasticV2.adapter[chain as Chain]?.fetch(timestamp, {})) : {} as FetchResultVolume;
            const dailyVolume = Number(a.dailyVolume) + Number(elasticV2?.dailyVolume || 0)
            const totalVolume = Number(a.totalVolume) + Number(elasticV2?.totalVolume || 0)
            return {
              dailyVolume: `${dailyVolume}`,
              totalVolume: `${totalVolume}`,
              timestamp
            };
          },
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
    classic: buildFromEndpoints(classicEndpoints, classicGraphs, DEFAULT_DAILY_VOLUME_FIELD, "dmmDayDatas", false),
    elastic: buildFromEndpoints(elasticEndpoints, elasticGraphs, "volumeUSD", "kyberSwapDayDatas", true)
  }
}

export default adapter;
