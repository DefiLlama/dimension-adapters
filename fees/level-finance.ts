import * as sdk from "@defillama/sdk";
import BigNumber from 'bignumber.js'
import { Chain } from '@defillama/sdk/build/general'
import { gql, GraphQLClient } from 'graphql-request'
import { ChainEndpoints } from '../adapters/types'
import { Adapter } from '../adapters/types'
import { BSC, ARBITRUM } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'

const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('AFaRssJTqNReTtU2XdTGPhN38YVPNBc7faMNKA1mU54h'),
  [ARBITRUM]: sdk.graph.modifyEndpoint('AV58XWaZUZPJ2w1x2wYmGEivVZmDojGW3fAYggUAujtD'),
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
        dailyRevenue: dailyFee.times(55).dividedBy(100).toString(),
        totalFees: totalFee.toString(),
        dailyHoldersRevenue: dailyFee.times(20).dividedBy(100).toString(),
        dailyTreasuryRevenue: dailyFee.times(30).dividedBy(100).toString(),
        dailySupplySideRevenue: dailyFee.times(45).dividedBy(100).toString(),
      }
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [BSC]: {
      fetch: graphs(endpoints)(BSC),
      start: '2022-12-26',
      meta: {
        methodology: {
          Fees: 'All mint, burn, margin, liquidation and swap fees are collect',
          UserFees:
            'All mint, burn, margin, liquidation and swap fees are collect',
          Revenue: 'Revenue is 55% of the total fees, which goes to Treasury and LVL/LGO stakers',
          HoldersRevenue: '20% of the total fees goes to LVL/LGO stakers',
          TreasuryRevenue: '30% of the total fees goes to Treasury'
        },
      },
    },
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: '2023-06-09',
      meta: {
        methodology: {
          Fees: 'All mint, burn, margin, liquidation and swap fees are collect',
          UserFees:
            'All mint, burn, margin, liquidation and swap fees are collect',
          Revenue: 'Revenue is 55% of the total fees, which goes to Treasury and LVL/LGO stakers',
          HoldersRevenue: '20% of the total fees goes to LVL/LGO stakers',
          TreasuryRevenue: '30% of the total fees goes to Treasury'
        },
      },
    },
  },
}

export default adapter
