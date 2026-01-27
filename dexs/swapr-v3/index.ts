import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { request } from 'graphql-request'
import * as sdk from '@defillama/sdk'

const protocolFee = 0.1

const fetch = async (
  _timestamp: number,
  _: any,
  options: FetchOptions,
): Promise<any> => {
  const dayID = Math.floor(options.startOfDay / 86400)
  const query = `
    {
        algebraDayData(id:${dayID}) {
            id
            volumeUSD
            feesUSD
        }
    }`
  const url = sdk.graph.modifyEndpoint(
    'YwkNWffc8UTH77wDqGWgMShMq1uXdiQsD5wrD5MzKwJ',
  )
  const req = await request(url, query)
  return {
    dailyVolume: req.algebraDayData?.volumeUSD,
    dailyFees: req.algebraDayData?.feesUSD,
    dailyUserFees: req.algebraDayData?.feesUSD,
    dailyRevenue: req.algebraDayData?.feesUSD,
    dailyProtocolRevenue: req.algebraDayData?.feesUSD * protocolFee,
    dailySupplySideRevenue: req.algebraDayData?.feesUSD * (1 - protocolFee),
  }
}

const methodology = {
  Fees: 'Swap fees paid by users.',
  UserFees: 'Swap fees paid by users.',
  Revenue: '10% swap fees collected by Swapr protocol.',
  ProtocolRevenue: '10% swap fees collected by Swapr protocol.',
  SupplySideRevenue: '90% swap fees distributed to LPs.',
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  chains: [CHAIN.XDAI],
  start: '2023-09-22',
}

export default adapter
