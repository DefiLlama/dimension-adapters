import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import fetchURL from "../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7FpNAjYhdo41FSdEro5P55uviKw69yhfPgxiWzPkr9au'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('7cXBpS75ThtbYwtCD8B277vUfWptmz6vbhk9BKgYrEvQ'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('6okUrfq2HYokFytJd2JDhXW2kdyViy5gXWWpZkTnSL8w'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('EXzFgeWbfgcLgUFEa9rHcQtTy2EcdvJnosTVkPvKe7EU'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('4m6FwSHYnkQRUBSKdhh5heGd1ojTAXwEiacUyFix2Ygx'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('7ZnKrxY26bDHZPSqJ3MNkDNjaRXLoc1ZiATDLbVjWa7H'),
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('i82AxuGMFX7bqGNpXGrUvXqFMWZjLeRTNpJFvc3aW8L'),
};

const fetchBribesRevenue = async (options: FetchOptions) => {
  if (options.chain !== CHAIN.ETHEREUM) {
    return 0
  }
  const bribes: any[] = (await fetchURL(`https://storage.googleapis.com/crvhub_cloudbuild/data/bounties/stats.json`)).claimsLast365Days.claims

  const startOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.startTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })

  const endOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.endTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })

  return (endOfDay.value - startOfDay.value).toString()
}

const emptyFees = {
  dailyFees: '0',
  dailyRevenue: '0',
  dailyHoldersRevenue: '0',
  dailySupplySideRevenue: '0',
  dailyUserFees: '0',
  dailyProtocolRevenue: '0',
  dailyBribesRevenue: '0'
}

const fetchGraph = async (options: FetchOptions) => {
  if (options.chain === CHAIN.XDAI) { // XDAI subgraph is not working
    return emptyFees
  }
  // Add the adminFeesUSD_gt: 0 to the where clause to filter out the pools with no admin fees and possibly scammy pools
  const graphQuery = gql`
    query fees($timestamp: Int!)
      {
        dailyPoolSnapshots (
          orderBy: timestamp
          orderDirection: desc
          first: 1000
          where: {
            timestamp: $timestamp
            totalDailyFeesUSD_lte: 1000000
            adminFeesUSD_gt: 0 
      }
      ) {
        totalDailyFeesUSD
        adminFeesUSD
        lpFeesUSD
        pool {
          symbol
        }
        timestamp
      }
    }`;

  const utcStartTimestamp = getTimestampAtStartOfDayUTC(options.startTimestamp);

  const graphRes = await request(endpoints[options.chain], graphQuery, {
    timestamp: utcStartTimestamp,
  });

  const blacklist = ['ypaxCrv', 'A3CRV-f', 'STETHETH_C-f', 'crvTricrypto']
  const filterPools = graphRes.dailyPoolSnapshots.filter((v: any) => !blacklist.includes(v.pool.symbol))

  const dailyFees = filterPools.reduce((acc: number, curr: any) => acc + parseFloat(curr.totalDailyFeesUSD), 0)
  const dailyRevenue = filterPools.reduce((acc: number, curr: any) => acc + parseFloat(curr.adminFeesUSD), 0)
  const dailySupplySideRevenue = filterPools.reduce((acc: number, curr: any) => acc + parseFloat(curr.lpFeesUSD), 0)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: '0',
    dailyBribesRevenue: await fetchBribesRevenue(options)
  }
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.toTimestamp < Date.now() / 1e3 - 24 * 3600) {
    return await fetchGraph(options)
  }
  if (options.chain === CHAIN.AVAX) {
    return await fetchGraph(options)
  }
  const response = (await fetchURL(`https://prices.curve.finance/v1/chains/${options.chain}`));
  const fees = (response.data as any[])
    .filter(e => e.trading_fee_24h < 1_000_000).reduce((all, pool) => {
      return all + pool.liquidity_fee_24h + pool.trading_fee_24h
    }, 0)

  const allFees: any = {
    dailyFees: fees,
    dailyUserFees: `${fees}`,
    dailyRevenue: `${fees / 2}`,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: `${fees / 2}`,
    dailySupplySideRevenue: `${fees / 2}`,
    dailyBribesRevenue: await fetchBribesRevenue(options)
  };

  return allFees
};

const start: Record<string, string> = {
  [CHAIN.ETHEREUM]: '2020-01-01',
  [CHAIN.OPTIMISM]: '2021-05-09',
  [CHAIN.ARBITRUM]: '2021-09-20',
  [CHAIN.POLYGON]: '2021-05-03',
  [CHAIN.AVAX]: '2021-10-06',
  [CHAIN.FANTOM]: '2021-05-09',
  [CHAIN.XDAI]: '2021-05-09'
}

const methodology = {
  UserFees: "Users pay a trading fee from 0.04% to 0.4% on each swap (as of July 2022, the fee on all pools was 0.04%)",
  Fees: "Trading fees paid by users",
  Revenue: "A 50% of the trading fee is collected by veCRV holders",
  ProtocolRevenue: "Treasury have no revenue",
  HoldersRevenue: "A 50% of the trading fee is collected by the users who have vote locked their CRV",
  SupplySideRevenue: "A 50% of all trading fees are distributed among liquidity providers"
}

const adapter: Adapter = {
  version: 1,
  adapter: Object.keys(start).reduce((all, chain) => {
    all[chain] = {
      fetch,
      start: start[chain],
      meta: { methodology },
    }
    return all
  }, {} as any)
}

export default adapter;
