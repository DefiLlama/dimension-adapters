import BigNumber from 'bignumber.js'
import { Adapter, FetchOptions } from "../adapters/types"
import { gql, GraphQLClient } from 'graphql-request'
import { CHAIN } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'

const endpoints: Record<string, string> = {
  [CHAIN.BASE]: 'https://subgraph.xena.finance/subgraphs/name/analyticsv2'
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const client = new GraphQLClient(endpoints[options.chain])
  const GET_PROTOCOL_STATS = gql`
    query ProtocolQuery($startBlock: Int!, $endBlock: Int!) {
      today: protocols(block: { number: $endBlock }) {
        totalFee
      }
      yesterday: protocols(block: { number: $startBlock }) {
        totalFee
      }
    }
  `
  const [startBlock, endBlock] = await Promise.all([
    getBlock(timestamp - 86400, options.chain, {}),
    getBlock(timestamp, options.chain, {}),
  ])

  const graphRes = await client.request(GET_PROTOCOL_STATS, {
    startBlock: startBlock,
    endBlock: endBlock,
  })
  const todayFee = new BigNumber(graphRes.today[0].totalFee)
  const yesterdayFee = new BigNumber(graphRes.yesterday[0].totalFee)
  const dailyFee = todayFee.minus(yesterdayFee).dividedBy(1e30)

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyFee.times(50).dividedBy(100).toString(),
    dailyProtocolRevenue: dailyFee.times(40).dividedBy(100).toString(),
    dailySupplySideRevenue: dailyFee.times(50).dividedBy(100).toString(),
  }
}

const adapter: Adapter = {
  deadFrom: '2025-01-01',
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },

  methodology: {
    Fees: 'All mint, burn, margin, liquidation and swap fees are collect',
    UserFees: 'All mint, burn, margin, liquidation and swap fees are collect',
    Revenue: 'Revenue is 50% of the total fees, which goes to Treasury and is reserved for development',
    ProtocolRevenue: '40% of the total fees goes to Treasury'
  },
}

export default adapter
