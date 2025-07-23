import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions, FetchResultV2 } from "../adapters/types"
import { Chain } from  "../adapters/types";
import fetchURL from "../utils/fetchURL";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7FpNAjYhdo41FSdEro5P55uviKw69yhfPgxiWzPkr9au'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('7cXBpS75ThtbYwtCD8B277vUfWptmz6vbhk9BKgYrEvQ'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('6okUrfq2HYokFytJd2JDhXW2kdyViy5gXWWpZkTnSL8w'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('EXzFgeWbfgcLgUFEa9rHcQtTy2EcdvJnosTVkPvKe7EU'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('4m6FwSHYnkQRUBSKdhh5heGd1ojTAXwEiacUyFix2Ygx'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('7ZnKrxY26bDHZPSqJ3MNkDNjaRXLoc1ZiATDLbVjWa7H'),
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('i82AxuGMFX7bqGNpXGrUvXqFMWZjLeRTNpJFvc3aW8L'),
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($timestampFrom: Int!, $timestampTo: Int!)
  {
    dailyPoolSnapshots (
      orderBy: timestamp
      orderDirection: desc
      first: 1000
      where: {
        timestamp_gte: $timestampFrom
        timestamp_lte: $timestampTo
        totalDailyFeesUSD_lte: 1000000
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

  return (chain: Chain) => {
    return async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
      const graphRes = await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      });

      const blacklist = ['ypaxCrv', 'A3CRV-f', 'STETHETH_C-f']
      const feesPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => !blacklist.includes(v.pool.symbol)).map((vol: any): number => {
        return parseFloat(vol.totalDailyFeesUSD);
      })
      const revPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => !blacklist.includes(v.pool.symbol)).map((vol: any): number => {
        return parseFloat(vol.adminFeesUSD);
      });
      const revLPPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => !blacklist.includes(v.pool.symbol)).map((vol: any): number => {
        return parseFloat(vol.lpFeesUSD);
      });

      const res: FetchResultV2 = { dailyProtocolRevenue: "0", }
      if (feesPerPool.length > 0) {
        const dailyFee = feesPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);
        res["dailyUserFees"] = dailyFee.toString()
        res["dailyFees"] = dailyFee.toString()
      }
      if (revPerPool.length > 0) {
        const dailyRev = revPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);
        res["dailyHoldersRevenue"] = dailyRev.toString()
        res["dailyRevenue"] = dailyRev.toString()
      }
      if (revLPPerPool.length > 0) {
        const dailyLPRev = revLPPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);
        res["dailySupplySideRevenue"] = dailyLPRev.toString()
      }
      return res
    }
  }
};

const fetchBribesRevenue = async (options: FetchOptions) => {
  if(options.chain === CHAIN.ETHEREUM){
    const bribes:any[] = (await fetchURL(`https://storage.googleapis.com/crvhub_cloudbuild/data/bounties/stats.json`)).claimsLast365Days.claims

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
  } else {
    return 0
  }
}

const fetch = async (options: FetchOptions) => {
  if(options.toTimestamp < Date.now()/1e3-24*3600){
    if(options.chain === CHAIN.XDAI){ // XDAI subgraph is not working
      return {
        dailyFees: '0',
        dailyRevenue: '0',
        dailyHoldersRevenue: '0',
        dailySupplySideRevenue: '0',
        dailyUserFees: '0',
        dailyProtocolRevenue: '0',
        dailyBribesRevenue: '0'
      }
    }
    const fees = await graph(endpoints)(options.chain)(options)
    fees['dailyBribesRevenue'] = await fetchBribesRevenue(options)
    return fees
  }
  const response = (await fetchURL(`https://prices.curve.finance/v1/chains/${options.chain}`));
  const fees = (response.data as any[])
  .filter(e => e.trading_fee_24h < 1_000_000).reduce((all, pool)=>{
    return all + pool.liquidity_fee_24h+pool.trading_fee_24h
  }, 0)
  const allFees:any = {
    dailyFees: fees,
    dailyUserFees: `${fees}`,
    dailyRevenue: `${fees/2}`,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: `${fees/2}`,
    dailySupplySideRevenue: `${fees/2}`,
  };
  allFees['dailyBribesRevenue'] = await fetchBribesRevenue(options)

  return allFees
};

const starts: Record<string, string> = {
  [CHAIN.ETHEREUM]: '2020-01-01',
  [CHAIN.OPTIMISM]: '2021-05-09',
  [CHAIN.ARBITRUM]: '2021-09-20',
  [CHAIN.POLYGON]: '2021-05-03',
  //[CHAIN.AVAX]: '2021-10-06,
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
  version: 2,
  adapter: Object.keys(starts).reduce((all, chain)=>{
    all[chain] = {
      fetch,
      start: starts[chain],
      meta: { methodology },
    }
    return all
  }, {} as any)
}

export default adapter;
