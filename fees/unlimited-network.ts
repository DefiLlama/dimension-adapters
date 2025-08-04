import { gql, GraphQLClient } from 'graphql-request'
import { FetchResultFees, FetchOptions } from '../adapters/types'
import { Adapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume'

const endpoints: Record<string, string> = {
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
const fetch = async (timestamp: number, _a: any, options: FetchOptions): Promise<FetchResultFees> => {
  
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const id = `DAILY-${dayTimestamp}`
  const client = new GraphQLClient(endpoints[options.chain])
  client.setHeader('origin', 'https://unlimited.trade')
  const graphRes: IData = (await client.request(historicalDataSwap, {
    id: id,
    periodType: 'DAILY',
  })).dataPoint;

  const dailyFees = Number(graphRes.protocolFee) / 10 ** 6;
  const dailySupplySideRevenue = dailyFees * 0.6;
  const dailyProtocolRevenue = dailyFees * 0.1;
  const dailyHoldersRevenue = dailyFees * 0.18;
  const dailyRevenue = (dailyProtocolRevenue + dailyHoldersRevenue)

  return {
    dailyFees,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailyRevenue,
  }
}

const adapter: Adapter = {
  deadFrom: '2024-01-30',
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-05-22',
    },
  },
}

export default adapter
