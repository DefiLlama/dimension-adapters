import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import { BreakdownAdapter, BaseAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { queryDuneSql } from "../helpers/dune";

const v2Endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd"),
};

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3,
  },
});

const config_v3: Record<string, { datasource: string, url: string, start: string }> = {
  [CHAIN.POLYGON]: {
    datasource: 'dune',
    url: sdk.graph.modifyEndpoint("FqsRcH1XqSjqVx9GRTvEJe959aCbKrcyGgDWBrUkG24g"),
    start: '2022-09-06',
  },
  // [CHAIN.DOGECHAIN]: {
  //   datasource: 'algebra',
  //   url: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  // },
  [CHAIN.POLYGON_ZKEVM]: {
    datasource: 'algebra',
    url: sdk.graph.modifyEndpoint("3L5Y5brtgvzDoAFGaPs63xz27KdviCdzRuY12spLSBGU"),
    start: '2023-03-27',
  },
  [CHAIN.SONEIUM]: {
    datasource: 'algebra',
    url: sdk.graph.modifyEndpoint("3GsT6AiuDiSzh2fXbFxUKtBxT8rBEGVdQCgHSsKMPHiu"),
    start: '2025-01-10',
  },
  [CHAIN.IMX]: {
    datasource: 'v3',
    url:  "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
    start: '2023-12-19',
  }
}

const v3Endpoints = Object.entries(config_v3)
  .filter(([_, chain]) => chain.datasource === 'v3')
  .reduce((acc, [chain, data]) => ({...acc, [chain]: data.url}), {} as Record<string, string>)

const algebraEndpoints = Object.entries(config_v3)
  .filter(([_, chain]) => chain.datasource === 'algebra')
  .reduce((acc, [chain, data]) => ({...acc, [chain]: data.url}), {} as Record<string, string>)

console.log(algebraEndpoints)

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 85, // 100% of fees are going to LPs
    Revenue: 15, // Revenue is 100% of collected fees
  },
});

const algebraGraphs = getGraphDimensions2({
  graphUrls: algebraEndpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 85, // 100% of fees are going to LPs
    Revenue: 15, // Revenue is 100% of collected fees
  },
});


const fetchv2Graph = async (_a:any, _b:any, options: FetchOptions) => {
  return await v2Graph(options.chain)(options)
}

const fetchv3GraphEndpoint = async (options: FetchOptions) => {
  return await v3Graphs(options.chain.toLowerCase())(options)
}

const fetchv3AlgebraGraphEndpoint = async (options: FetchOptions) => {
  return await algebraGraphs(options.chain.toLowerCase())(options)
}

const fetchv3Dune = async (options: FetchOptions) => {
  const query = `
    SELECT 
      SUM(amount_usd) as volume
    FROM
      dex.trades
    WHERE
      project='quickswap' 
      AND blockchain = '${options.chain.toLowerCase()}'
      AND version='3'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `
  const chainData = await queryDuneSql(options, query)
  const volume = chainData[0]["volume"]

  return {
    dailyFees: volume * 0.003,
    dailyUserFees: volume * 0.003,
    dailyRevenue: volume * 0.003 * 0.15,
    dailyProtocolRevenue: '0',
    dailySupplySideRevenue: volume * 0.003 * 0.85,
    dailyHoldersRevenue: 0,
  }
}

const fetchv3Graph = async (_a:any, _b:any, options: FetchOptions) => {
  const chain_config = config_v3[options.chain]
  if (chain_config.datasource === 'algebra') {
    return fetchv3AlgebraGraphEndpoint(options)
  } else if (chain_config.datasource === 'dune') {
    return fetchv3Dune(options)
  } else {
    return fetchv3GraphEndpoint(options)
  }
}

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "A 0.3% of each swap is collected as trading fees",
  Revenue: "Protocol have no revenue",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: fetchv2Graph,
        start: '2020-10-08',
        meta: { methodology },
      },
    },
    v3: Object.keys(config_v3).reduce((acc, chain) => {
      acc[chain] = {
        fetch: fetchv3Graph,
        start: config_v3[chain].start,
        meta: { methodology },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
