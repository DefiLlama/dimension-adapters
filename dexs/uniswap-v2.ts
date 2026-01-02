import { CHAIN } from "../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { queryDuneSql } from "../helpers/dune";

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
  },
  [CHAIN.MONAD]: {
    factory: '0x182a927119d56008d921126764bf884221b10f59',
    source: 'LOGS',
    start: '2025-11-24',
    duneId: 'monad',
  },
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

function getLogAdapterConfig(options: FetchOptions) {
  if (options.startOfDay >= 1766966400 && options.chain === CHAIN.ETHEREUM) {
    // UNIfication has officially been executed onchain
    // https://x.com/Uniswap/status/2005018127260942798
    return {
      userFeesRatio: 1,
      revenueRatio: 0.05 / 0.3,
      protocolRevenueRatio: 0,
      holdersRevenueRatio: 0.05 / 0.3,
    }
  } else {
    return {
      userFeesRatio: 1,
      revenueRatio: 0,
      protocolRevenueRatio: 0,
      holdersRevenueRatio: 0,
    }
  }
}

const fetch = async (_t:any, _tb: any , options: FetchOptions) => {
  const prefetchData = options.preFetchedResults;
  const config = chainConfig[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  if (config.source === 'LOGS') {
    const fetchFunction = getUniV2LogAdapter({ factory: chainConfig[options.chain as keyof typeof chainConfig].factory, ...getLogAdapterConfig(options)})
    return await fetchFunction(options);
  }
  else if (config.source === 'DUNE') {
    const chainData = prefetchData.find((item: any) => item.blockchain === config.duneId);
    const dailyFees = chainData?.volume * 0.003 || 0;

    const feeRates = getLogAdapterConfig(options);
    
    return {
      dailyVolume: chainData?.volume || 0,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees * (1 - feeRates.revenueRatio),
      dailyRevenue: dailyFees * feeRates.revenueRatio,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: dailyFees * feeRates.holdersRevenueRatio,
    }
  }
  else {
    throw Error(`source not found for chain ${options.chain}`);
  }
}

const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: 'From 28 Dec 2025, 17% (0% before) fees on Ethereum shared to buy back and burn UNI.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'From 28 Dec 2025, 83% (100% before) fees on Ethereum are distributed to LPs.',
  HoldersRevenue: 'From 28 Dec 2025, 17% (0% before) fees on Ethereum shared to buy back and burn UNI.',
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  prefetch,
  methodology,
  dependencies: [Dependencies.DUNE],
}

export default adapter
