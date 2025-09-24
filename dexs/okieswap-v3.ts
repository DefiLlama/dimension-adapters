import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request from 'graphql-request'
// import {
//   DEFAULT_TOTAL_VOLUME_FIELD,
//   getGraphDimensions2,
// } from "../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.XLAYER]: "https://subgraph.okiedokie.fun/subgraphs/name/okieswap-v3",
};

const fetch = async (options: FetchOptions) => {
  const endpoint = v3Endpoints[options.chain];
  const toBlock = await options.getToBlock();
  const fromBlock = await options.getFromBlock();
  const query = `
  {
    todayPools: pools(block:{number:${toBlock}}, orderBy: totalValueLockedUSD, orderDirection: desc, first: 100) {
      id
      volumeUSD
      feesUSD
      protocolFeesUSD
    }
    yesterdayPools: pools(block:{number:${fromBlock}}, orderBy: totalValueLockedUSD, orderDirection: desc, first: 100) {
      id
      volumeUSD
      feesUSD
      protocolFeesUSD
    }
  }
  `
  const data = await request(endpoint, query)
  const blacklistedPools = new Set(['0x4e6c7d221b5fa285aabdd8c7fa692bc0c79e7d8b'])

  const sumFields = (pools: any[]) => {
    return pools.reduce(
      (acc, pool) => {
        if (blacklistedPools.has(pool.id)) return acc
        acc.volumeUSD += Number(pool.volumeUSD) || 0
        acc.feesUSD += Number(pool.feesUSD) || 0
        acc.protocolFeesUSD += Number(pool.protocolFeesUSD) || 0
        return acc
      },
      { volumeUSD: 0, feesUSD: 0, protocolFeesUSD: 0 }
    )
  }

  const today = sumFields(data.todayPools)
  const yesterday = sumFields(data.yesterdayPools)

  const dailyVolume = today.volumeUSD - yesterday.volumeUSD
  const dailyFees = today.feesUSD - yesterday.feesUSD
  const dailyProtocolRevenue = today.protocolFeesUSD - yesterday.protocolFeesUSD
  const dailyRevenue = dailyProtocolRevenue
  const dailySupplySideRevenue = dailyFees - dailyProtocolRevenue
  const dailyHoldersRevenue = 0

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue }
}

// const v3Graphs = getGraphDimensions2({
//   graphUrls: v3Endpoints,
//   totalVolume: {
//     factory: "factories",
//     field: DEFAULT_TOTAL_VOLUME_FIELD,
//   },
//   feesPercent: {
//     type: "fees",
//     ProtocolRevenue: 33.4,
//     HoldersRevenue: 0,
//     Fees: 100,
//     UserFees: 100, // User fees are 100% of collected fees
//     SupplySideRevenue: 66.6, // 66% of fees are going to LPs
//     Revenue: 33.4, // Revenue is 33% of collected fees
//   },
// });

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: '2025-08-17',
    },
  },
};

export default adapter;
