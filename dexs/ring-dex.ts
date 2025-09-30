import { CHAIN } from '../helpers/chains'
import { FetchOptions, } from '../adapters/types'
import { request } from 'graphql-request'

const v2Endpoints: any = {
  [CHAIN.ETHEREUM]: 'https://api.studio.thegraph.com/query/61509/ring-v2-eth-mainnet/version/latest',
  [CHAIN.BLAST]: 'https://api.studio.thegraph.com/query/61509/ring-v2-blast-mainnet/version/latest',
  [CHAIN.BSC]: 'https://api.studio.thegraph.com/query/109372/ring-v-2-bsc/version/latest',
}

const methodology = {
  Fees: 'User pays 0.3% fees on each swap.',
  Revenue: 'Protocol has no revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
}

const fetch = async (_: number, _1: any, { chain, startOfDay, dateString }: FetchOptions) => {
  const endpoint = v2Endpoints[chain]

  const graphQuery = `{
    uniswapDayDatas( where: { date: ${startOfDay} }) {      dailyVolumeUSD    }
  }`

  const { uniswapDayDatas } = await request(endpoint, graphQuery)
  if (!uniswapDayDatas.length)
    throw new Error(`No data found for ${chain} at ${dateString}`)

  const dailyVolume = uniswapDayDatas[0].dailyVolumeUSD
  const dailyFees = dailyVolume * 0.003

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

export default {
  version: 1,
  start: '2024-07-07',
  methodology,
  fetch,
  chains: Object.keys(v2Endpoints),
}
