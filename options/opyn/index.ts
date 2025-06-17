import request, { gql } from "graphql-request";
import { Fetch, FetchResultOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

interface IoTokenTrade {
    timestamp: string
    oToken: {
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
    paymentToken: {
        decimals: number
    }
    oTokenAmount: string
    paymentTokenAmount: string
}

const query = gql`
query trades($timestampFrom: Int!, $timestampTo: Int!) {
    otokenTrades(
        where: {timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo}
    ) {
        timestamp
        oToken {
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
        paymentToken {
            decimals
        }
        oTokenAmount
        paymentTokenAmount
    }
}
`

const endpoints = {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('6CYUucsekksXD3BRvwz9MPgLcytmrJEKFi9bhRT3trnt'),
};

const fetch: Fetch = async (timestamp) => {
    const notionalBal = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp })
    const premiumBal = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp })
    const timestampFrom = timestamp - 60 * 60 * 24
    const response = await request(endpoints[CHAIN.ETHEREUM], query, {
        timestampFrom,
        timestampTo: timestamp,
    }) as { otokenTrades: IoTokenTrade[] }
    const fetchResult: FetchResultOptions = { timestamp: timestampFrom }
    await response.otokenTrades.forEach((curr: any) => {
        notionalBal.add(curr.oToken.underlyingAsset.id, curr.oTokenAmount)
        premiumBal.add(curr.paymentToken.id, curr.paymentTokenAmount)
    })
    fetchResult.dailyNotionalVolume = await notionalBal.getUSDString()
    fetchResult.dailyPremiumVolume = await premiumBal.getUSDString()
    return fetchResult
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2020-12-29'
        }
    }
};
export default adapter;
