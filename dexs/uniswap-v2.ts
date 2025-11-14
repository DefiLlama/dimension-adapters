import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { queryDuneSql } from "../helpers/dune";

const chainv2mapping: any = {
  [CHAIN.ARBITRUM]: "ARBITRUM",
  [CHAIN.ETHEREUM]: "ETHEREUM",
  [CHAIN.POLYGON]: "POLYGON",
  [CHAIN.BASE]: "BASE",
  // [CHAIN.BSC]: "BNB",
  [CHAIN.OPTIMISM]: "OPTIMISM",
  [CHAIN.UNICHAIN]: "UNI",
}

const chainConfig: Record<string, { factory: string, source: string, start: string, duneId?: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    source: 'DUNE',
    start: '2020-04-19',
    duneId: 'ethereum'
  },
  [CHAIN.POLYGON]: {
    factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    source: 'DUNE',
    start: '2024-02-12',
    duneId: 'polygon',
  },
  [CHAIN.BASE]: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    source: 'DUNE',
    start: '2024-02-13',
    duneId: 'base',
  },
  [CHAIN.OPTIMISM]: {
    factory: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
    source: 'DUNE',
    start: '2024-02-13',
    duneId: 'optimism',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    source: 'DUNE',
    start: '2024-02-08',
    duneId: 'arbitrum',
  },
  [CHAIN.BSC]: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    source: 'DUNE',
    start: '2024-02-14',
    duneId: 'bnb',
  },
  [CHAIN.UNICHAIN]: {
    factory: '0x1f98400000000000000000000000000000000002',
    source: 'DUNE',
    start: '2025-01-24',
    duneId: 'unichain',
  },
  [CHAIN.AVAX]: {
    factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    source: 'DUNE',
    start: '2024-02-15',
    duneId: 'avalanche_c',
  },
  [CHAIN.BLAST]: {
    factory: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
    source: 'DUNE',
    start: '2024-03-24',
    duneId: 'blast',
  },
  [CHAIN.ZORA]: {
    factory: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
    source: 'DUNE',
    start: '2024-02-27',
    duneId: 'zora',
  }
}

const prefetch = async (options: FetchOptions) => {
  const query = `
    with tvl_pairs as (
      select distinct
        blockchain,
        id as project_contract_address
      from uniswap.tvl_daily
      where project = 'uniswap' 
        and version = '2'
        and block_date >= from_unixtime(${options.startTimestamp})
        and block_date <= from_unixtime(${options.endTimestamp})
        and coalesce(token0_balance_usd, 0) > 10000
        and coalesce(token1_balance_usd, 0) > 10000
    )
    select 
      d.blockchain,
      sum(d.amount_usd) as volume
    from dex.trades d
    where d.project = 'uniswap' 
      and d.version = '2'
      and TIME_RANGE
      and (d.blockchain, d.project_contract_address) in (
        select blockchain, project_contract_address from tvl_pairs
      )
    group by 1
  `
  return await queryDuneSql(options, query);
}


async function fetchV2Volume(_t:any, _tb: any , options: FetchOptions) {
  const { api } = options
  const endpoint = `https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ExploreStats?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22${api.chainId}%22%7D`
  const res = await httpGet(endpoint, {
    headers: {
      'accept': '*/*',
      'accept-language': 'th,en-US;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://app.uniswap.org',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://app.uniswap.org/',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  })
  const dataItem = res.stats.historicalProtocolVolume.Month.v2.find((item: any) => item.timestamp === options.startOfDay);
  if (!dataItem) {
    throw Error(`data not found for date ${options.startOfDay} - chain ${options.chain}`);
  }
  
  const dailyVolume = dataItem.value;
  
  return { dailyVolume, dailyFees: Number(dailyVolume) * 0.003, dailyUserFees: Number(dailyVolume) * 0.003, dailySupplySideRevenue: Number(dailyVolume) * 0.003, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0 }
}

const getLogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
}

const fetch = async (_t:any, _tb: any , options: FetchOptions) => {
  const prefetchData = options.preFetchedResults;
  const config = chainConfig[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  if (config.source === 'LOGS') {
    const fetchFunction = getUniV2LogAdapter({ factory: chainConfig[options.chain as keyof typeof chainConfig].factory, ...getLogAdapterConfig})
    return await fetchFunction(options);
  }
  else if (config.source === 'DUNE') {
    const chainData = prefetchData.find((item: any) => item.blockchain === config.duneId);
    const dailyFees = chainData?.volume * 0.003 || 0;

    return {
      dailyVolume: chainData?.volume || 0,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0
    }
  }
  else {
    throw Error(`source not found for chain ${options.chain}`);
  }
}

const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: 'Protocol make no revenue.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
  HoldersRevenue: 'No revenue for UNI holders.',
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  prefetch,
  methodology,
  dependencies: [Dependencies.DUNE]
  // adapter: {
  //   [CHAIN.BSC]: {
  //     fetch: async (_t:any, _tb: any , options: FetchOptions) => {
  //       const fetchFunction = getUniV2LogAdapter({ factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', ...getLogAdapterConfig})
  //       return await fetchFunction(options);
  //     },
  //   },
  //   ...Object.keys(chainv2mapping).reduce((acc: any, chain) => {
  //     acc[chain] = {
  //       fetch: fetchV2Volume,
  //     }
  //     return acc
  //   }, {})
  // }
}

export default adapter
