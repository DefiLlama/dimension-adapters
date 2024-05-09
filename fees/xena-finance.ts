import BigNumber from 'bignumber.js'
import { Chain } from '@defillama/sdk/build/general'
import { gql, GraphQLClient } from 'graphql-request'
import { ChainEndpoints } from '../adapters/types'
import { Adapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'

const endpoints = {
  [CHAIN.BASE]: 'https://subgraph.xena.finance/subgraphs/name/analyticsv2'
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
        getBlock(timestamp - 86400, chain, {}),
        getBlock(timestamp, chain, {}),
      ])
      const graphRes = await client.request(GET_PROTOCOL_STATS, {
        startBlock: startBlock,
        endBlock: endBlock,
      })
      const todayFee = new BigNumber(graphRes.today[0].totalFee)
      const yesterdayFee = new BigNumber(graphRes.yesterday[0].totalFee)
      const dailyFee = todayFee.minus(yesterdayFee).dividedBy(1e30)
      const totalFee = todayFee.dividedBy(1e30);

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyUserFees: dailyFee.toString(),
        dailyRevenue: dailyFee.times(50).dividedBy(100).toString(),
        totalFees: totalFee.toString(),
        dailyTreasuryRevenue: dailyFee.times(40).dividedBy(100).toString(),
        dailySupplySideRevenue: dailyFee.times(50).dividedBy(100).toString(),
      }
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs(endpoints)(CHAIN.BASE),
      start: 1696856400,
      meta: {
        methodology: {
          Fees: 'All mint, burn, margin, liquidation and swap fees are collect',
          UserFees:
            'All mint, burn, margin, liquidation and swap fees are collect',
          Revenue: 'Revenue is 50% of the total fees, which goes to Treasury and is reserved for development',
          TreasuryRevenue: '40% of the total fees goes to Treasury'
        },
      },
    },
  },
}

export default adapter
