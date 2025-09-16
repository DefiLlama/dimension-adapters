import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { request } from 'graphql-request'
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume'
import { start } from 'repl'

const v2Endpoints: any = {
  [CHAIN.ETHEREUM]:
    'https://api.studio.thegraph.com/query/61509/ring-v2-eth-mainnet/version/latest',
  [CHAIN.BLAST]:
    'https://api.studio.thegraph.com/query/61509/ring-v2-blast-mainnet/version/latest',
}

const chainv2mapping: any = {
  [CHAIN.ETHEREUM]: 'ETHEREUM',
  [CHAIN.BLAST]: 'BLAST',
}

const methodology = {
  Fees: 'User pays 0.3% fees on each swap.',
  UserFees: 'User pays 0.3% fees on each swap.',
  Revenue: 'Protocol makes 0.3% fees revenue.',
  ProtocolRevenue: 'Protocol makes 0.3% fees revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
  HoldersRevenue: 'No revenue for RING holders.',
}

const fetch = async (timestamp: number, _: any, { chain }: FetchOptions) => {
  const endpoint = v2Endpoints[chain]
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))

  const graphQuery = `{
    uniswapDayDatas(first:1000, orderBy: date, orderDirection: desc) {
      date
      dailyVolumeUSD
    }
  }`

  const { uniswapDayDatas } = await request(endpoint, graphQuery)
  const dailyVolume = uniswapDayDatas.find(
    (dayItem: any) => Number(dayItem.date) === dayTimestamp
  )?.dailyVolumeUSD

  if (!uniswapDayDatas)
    return {
      dailyVolume: 0,
      dailyFees: 0,
    }

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyVolume * 0.003,
    dailyUserFees: dailyVolume * 0.003,
    dailySupplySideRevenue: dailyVolume * 0.003,
    dailyProtocolRevenue: dailyVolume * 0.003,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    ...Object.keys(chainv2mapping).reduce((acc: any, chain) => {
      acc[chain] = {
        fetch: fetch,
      }
      return acc
    }, {}),
  },
}

export default adapter
