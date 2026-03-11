import request, { gql } from "graphql-request";
import { Fetch, FetchResultOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import * as sdk from "@defillama/sdk";

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

const endpoints = {
    [CHAIN.ARBITRUM]: "https://api.goldsky.com/api/public/project_clhf7zaco0n9j490ce421agn4/subgraphs/arbitrum-one/production/gn",
};

const fetch: Fetch = async (timestamp) => {
    const notinalBal = new sdk.Balances({ chain: CHAIN.ARBITRUM, timestamp })
    const premiumBal = new sdk.Balances({ chain: CHAIN.ARBITRUM, timestamp })
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
    response.optionsBoughtActions.forEach((curr: any) => {
        const token = curr.otoken.underlyingAsset.id
        notinalBal.add(token, curr.amount)
        premiumBal.add('tether', curr.premium / 1e6, { skipChain: true })
    })
    response_sold.optionsSoldActions.forEach(async (curr: any) => {
        const token = curr.otoken.underlyingAsset.id
        notinalBal.add(token, curr.amount)
        premiumBal.add('tether', curr.premium / 1e6, { skipChain: true })
    })
    fetchResult.dailyNotionalVolume = await notinalBal.getUSDString()
    fetchResult.dailyPremiumVolume = await premiumBal.getUSDString()
    return fetchResult
}
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: '2023-07-04'
        },
    },
};
export default adapter;
