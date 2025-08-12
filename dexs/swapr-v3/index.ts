import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { request } from 'graphql-request'
import * as sdk from '@defillama/sdk'

const protocolFee = 0.1 // @todo: update this to the actual protocol fee

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
    dailyRevenue: req.algebraDayData?.feesUSD,
    dailyProtocolRevenue: req.algebraDayData?.feesUSD * protocolFee,
    dailyHoldersRevenue: req.algebraDayData?.feesUSD * (1 - protocolFee),
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.XDAI],
  start: '2023-09-22',
}

export default adapter
