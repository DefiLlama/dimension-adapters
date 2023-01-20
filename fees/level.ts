import BigNumber from 'bignumber.js'
import { Chain } from '@defillama/sdk/build/general'
import { gql, GraphQLClient } from 'graphql-request'
import { ChainEndpoints } from '../adapters/types'
import { Adapter } from '../adapters/types'
import { BSC } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'

const endpoints = {
  [BSC]: 'https://graph.level.finance/subgraphs/name/level/main',
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const client = new GraphQLClient(graphUrls[chain])
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
        getBlock(timestamp - 86400, BSC, {}),
        getBlock(timestamp, BSC, {}),
      ])
      const graphRes = await client.request(GET_PROTOCOL_STATS, {
        startBlock: startBlock,
        endBlock: endBlock,
      })
      const todayFee = new BigNumber(graphRes.today[0].totalFee)
      const yesterdayFee = new BigNumber(graphRes.yesterday[0].totalFee)
      const dailyFee = todayFee.minus(yesterdayFee).dividedBy(1e30)

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyUserFees: dailyFee.toString(),
        dailyRevenue: dailyFee.dividedBy(2).toString(),
      }
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [BSC]: {
      fetch: graphs(endpoints)(BSC),
      start: async () => 1672063200,
      meta: {
        methodology: {
          Fees: 'All mint, burn, margin, liquidation and swap fees are colletec',
          UserFees:
            'All mint, burn, margin, liquidation and swap fees are colletec',
          Revenue: '50% of the total fee',
        },
      },
    },
  },
}

export default adapter
