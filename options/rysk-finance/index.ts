import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, FetchResultOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices"

interface IoTokenTrade {
    timestamp: string
    otoken: {
        strikeAsset: {
            name: string
            id: string
            decimals: number
        }
        underlyingAsset: {
            name: string
            id: string
            decimals: number
        }
        strikePrice: string
        decimals: number
    }
    amount: string;
    premium: string;
    fee: string;
}

const query = gql`
query trades($timestampFrom: Int!, $timestampTo: Int!) {
    optionsBoughtActions(
        where: {timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo}
    ) {
          otoken {
              strikeAsset {
                  name
                  id
                  decimals
              }
              underlyingAsset {
                  id
              }
              strikePrice
              decimals
          }
          amount
          premium
          fee
          timestamp
    }
}
`

const querySold = gql`
query trades($timestampFrom: Int!, $timestampTo: Int!) {
  optionsSoldActions(
        where: {timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo}
    ) {
          otoken {
              strikeAsset {
                  name
                  id
                  decimals
              }
              underlyingAsset {
                  id
              }
              strikePrice
              decimals
          }
          amount
          premium
          fee
          timestamp
    }
}
`

const normalizeValues = (value: string, decimals: number) => BigNumber(value).dividedBy(10 ** decimals)

const endpoints = {
    [CHAIN.ARBITRUM]: "https://api.goldsky.com/api/public/project_clhf7zaco0n9j490ce421agn4/subgraphs/arbitrum-one/0.1.17/gn",
};

const prices = {} as IJSON<number>
const getUnderlyingSpotPrice = async (address: string, timestamp: number) => {
    const key = `${CHAIN.ARBITRUM}:${address}`
    if (!prices[address]) prices[address] = (await getPrices([key], timestamp))[key].price
    return prices[address]
}
const fetch: Fetch = async (timestamp) => {
    const timestampFrom = timestamp - 60 * 60 * 24
    const response = await request(endpoints[CHAIN.ARBITRUM], query, {
        timestampFrom,
        timestampTo: timestamp,
    }) as { optionsBoughtActions: IoTokenTrade[] }

    const response_sold = await request(endpoints[CHAIN.ARBITRUM], querySold, {
      timestampFrom,
      timestampTo: timestamp,
  }) as { optionsSoldActions: IoTokenTrade[] }

    const fetchResult: FetchResultOptions = { timestamp: timestampFrom }
    const processed = await response.optionsBoughtActions.reduce(async (accP, curr) => {
        const acc = await accP
        const underlyingAssetSpotPrice = await getUnderlyingSpotPrice(curr.otoken.underlyingAsset.id, +curr.timestamp)
        acc.notional = acc.notional.plus(
            normalizeValues(curr.amount, 18)
                .multipliedBy(underlyingAssetSpotPrice)
        )
        acc.premium = acc.premium.plus(normalizeValues(curr.premium, 6))
        return acc
    }, Promise.resolve({ notional: BigNumber(0), premium: BigNumber(0) }) as Promise<{ notional: BigNumber, premium: BigNumber }>)
    const processedSold = await response_sold.optionsSoldActions.reduce(async (accP, curr) => {
      const acc = await accP
      const underlyingAssetSpotPrice = await getUnderlyingSpotPrice(curr.otoken.underlyingAsset.id, +curr.timestamp)
      acc.notional = acc.notional.plus(
          normalizeValues(curr.amount, 18)
              .multipliedBy(underlyingAssetSpotPrice)
      )
      acc.premium = acc.premium.plus(normalizeValues(curr.premium, 6))
      return acc
  }, Promise.resolve({ notional: BigNumber(0), premium: BigNumber(0) }) as Promise<{ notional: BigNumber, premium: BigNumber }>)
    fetchResult.dailyNotionalVolume = processed.notional.plus(processedSold.notional).toString()
    fetchResult.dailyPremiumVolume = processed.premium.plus(processedSold.premium).toString()
    return fetchResult
}
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: async () => 1681430400
    },
  },
};
export default adapter;
