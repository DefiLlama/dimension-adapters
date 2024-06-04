import { Adapter } from "../../adapters/types";
import { FANTOM } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../../adapters/types";
import BigNumber from "bignumber.js"
// import retry from 'async-retry'

import { Chain } from "@defillama/sdk/build/general";

import { getPrices } from '../../utils/prices'

type THeader = {
  [s: string]: string;
}
const headers: THeader = {
  'origin': 'https://polter.finance/',
  'referer': 'https://polter.finance/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const ONE_DAY = 24 * 60 * 60; // in seconds
const RECORDS_PER_PAGE = 100

const endpoints = {
  [FANTOM]: "https://api.studio.thegraph.com/query/71811/polter/version/latest",
};

const PLATFORM_TOKEN = '0x5c725631fd299703d0a74c23f89a55c6b9a0c52f'
const tokens = {
  '0x5c725631fd299703d0a74c23f89a55c6b9a0c52f': {
    gecko: 'coingecko:polter-finance',
    decimals: 18
  },
  '0xbbce4b1513d4285bd7a59c2c63835535151c8e7c': {
    gecko: 'coingecko:fantom',
    decimals: 18
  },
  '0x5a75a5f3a637cc9394816efc553d102302d4cfcd': {
    gecko: 'coingecko:usd-coin',
    decimals: 6
  },
  '0xa826b29d81caef8c9aa212f172ab3ef00566e91e': {
    gecko: 'coingecko:magic-internet-money',
    decimals: 18
  },
  '0x4bf6f3210488091a0111daf7ab7cf840a3af8022': {
    gecko: 'coingecko:stader-sftmx',
    decimals: 18
  },
  '0x0299553df0fa396c0f6f3456d293608e189c3cf3': {
    gecko: 'coingecko:solana',
    decimals: 18
  },
  '0xb49da25f726451ba0e7c7e1c0b273322d2656514': {
    gecko: 'coingecko:layerzero-usdc',
    decimals: 6
  },
  '0xc60f08059586849810d9c19c67919d2d99174ecf': {
    gecko: 'coingecko:axlusdc',
    decimals: 6
  },
  '0xa37e0d5590436bd9abd2803c18c328a650b236ee': {
    gecko: 'coingecko:bitcoin',
    decimals: 8
  },
  '0x328c7a684f160c089ebff07ff1b5a417f024979e': {
    gecko: 'coingecko:bridged-wrapped-ether-stargate',
    decimals: 18
  }
}

const geckoNames = (() => {
  const addresses = Object.keys(tokens)
  return addresses.map((address) => {
    return tokens[address].gecko
  })
})()

type RewardsPaid = {
  id: number
  reward: BigNumber
  rewardsToken: string
  blockTimestamp: number
}

const rewardsPaid = async (graphUrls: ChainEndpoints, chain: string, timestamp: number, skip: number) => {
  const graphQuery = gql
    `{
        rewardPaids(
          first: ${RECORDS_PER_PAGE}
          skip: ${skip}
          where: { blockTimestamp_lte: ${timestamp}, blockTimestamp_gt: ${timestamp - ONE_DAY} },
          orderBy: blockTimestamp
          order: ASC
        ) {
          id
          reward
          rewardsToken
          blockTimestamp
        }
    }`

  const graphRes = await request(graphUrls[chain], graphQuery, {}, headers);
  const rewardsPaid = graphRes.rewardPaids
  return rewardsPaid
}

const graphs: FetchV2 = async ({ chain, endTimestamp }) => {

  let recordsProcessed = 0
  let rewardsMap = {}
  let pricesMap = {}
  let rewards: RewardsPaid[] = []
// console.log(['token','amount','price','fee'].join(','))
  do {
    rewards = await rewardsPaid(endpoints, chain, endTimestamp, recordsProcessed);
    // console.log('rewards', rewards)

    for (let i=0; i<rewards.length; i++) {
      // console.log('i + recordsProcessed', i + recordsProcessed)
      const reward: RewardsPaid = rewards[i]
      // console.log('reward', reward)
      if (!(reward.rewardsToken in rewardsMap)) { // create new entry for token if not already exists
        rewardsMap[reward.rewardsToken] = BigNumber('0')
      }

      if (!(reward.blockTimestamp in pricesMap)) {
        pricesMap[reward.blockTimestamp] = await getPrices(geckoNames, reward.blockTimestamp)
      }
      const price = pricesMap[reward.blockTimestamp][tokens[reward.rewardsToken].gecko] // prices returned are already in usd
      const fee = BigNumber(reward.reward).multipliedBy(price.price).div(BigNumber('10').pow(tokens[reward.rewardsToken].decimals)) // token decimals
// console.log([reward.rewardsToken, reward.reward, price.price, fee].join(','))
      rewardsMap[reward.rewardsToken] = rewardsMap[reward.rewardsToken].plus(fee)
    }

    recordsProcessed += RECORDS_PER_PAGE
  } while(rewards.length > 0) // keep searching while there are still records

  // console.log('rewardsMap', rewardsMap)
  // total up the fees of all tokens
  let fees = BigNumber('0')
  let revenue = BigNumber('0')
  const addresses = Object.keys(rewardsMap)
  for (let i=0; i<addresses.length; i++) {
    const address = addresses[i]
    const rewardValue = rewardsMap[address]
    if (address.toLowerCase() != PLATFORM_TOKEN.toLowerCase()) {
      fees = fees.plus(rewardValue)
    }
    revenue = revenue.plus(rewardValue)
  }

  return {
    dailyFees: fees.toString(10),
    dailyRevenue: revenue.toString(10),  // revenue = user fees + depositors fees which is 50-50 (exclude platform token) at the moment
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [FANTOM]: {
      fetch: graphs,
      start: 1706546953, // Jan-29-2024 04:49:13 PM +UTC
      meta: {
        methodology: {
          Fees: "lockers' revenue = stakers' revenue + 50% penalty from early exit",
          Revenue: "depositors' revenue from borrow interests",
        }
      }
    },
  },
}

export default adapter;
