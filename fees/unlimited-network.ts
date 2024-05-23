import BigNumber from 'bignumber.js'
import { Chain } from '@defillama/sdk/build/general'
import { gql, GraphQLClient } from 'graphql-request'
import { ChainEndpoints, FetchResultFees } from '../adapters/types'
import { Adapter } from '../adapters/types'
import { BSC, CHAIN } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume'

const endpoints = {
  [CHAIN.ARBITRUM]: 'https://subgraph.satsuma-prod.com/bc8f64747511/unlimited/mainnet.unlimited/api',
}
interface IData {
  id: string;
  periodType: string;
  protocolFee: string;
  protocolFeeTotal: string;
  tradingVolume: string;
  tradingVolumeTotal: string
}

const historicalDataSwap = gql`
  query get_volume($id: String!) {
    dataPoint(id: $id) {
      id
      periodType
      protocolFee
      protocolFeeTotal
      tradingVolume
      tradingVolumeTotal
      }
  }
`
const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
      const id = `DAILY-${dayTimestamp}`
      const client = new GraphQLClient(graphUrls[chain])
      client.setHeader('origin', 'https://unlimited.trade')
      const graphRes: IData = (await client.request(historicalDataSwap, {
        id: id,
        periodType: 'DAILY',
      })).dataPoint;

      const dailyFees = Number(graphRes.protocolFee) / 10 ** 6;
      const totalFees = Number(graphRes.protocolFeeTotal) / 10 ** 6
      const dailySupplySideRevenue = dailyFees * 0.6;
      const dailyProtocolRevenue = dailyFees * 0.1;
      const dailyHoldersRevenue = dailyFees * 0.18;
      const dailyRevenue = (dailyProtocolRevenue + dailyHoldersRevenue)

      const totalSupplySideRevenue = totalFees * 0.6;
      const totalProtocolRevenue = totalFees * 0.10;
      const totalHoldersRevenue = totalFees * 0.18;
      const totalRevenue = (totalProtocolRevenue + totalHoldersRevenue)
      return {
        dailyFees: `${dailyFees}`,
        totalFees: `${totalFees}`,
        dailySupplySideRevenue: `${dailySupplySideRevenue}`,
        dailyProtocolRevenue: `${dailyProtocolRevenue}`,
        dailyHoldersRevenue: `${dailyHoldersRevenue}`,
        dailyRevenue: `${dailyRevenue}`,
        totalProtocolRevenue: `${totalProtocolRevenue}`,
        totalSupplySideRevenue: `${totalSupplySideRevenue}`,
        totalRevenue: `${totalRevenue}`,
        timestamp
      }
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1684713600,
    },
  },
}

export default adapter
