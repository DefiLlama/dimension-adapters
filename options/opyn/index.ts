import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, FetchResultOptions, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices"

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

const normalizeValues = (value: string, decimals: number) => BigNumber(value).dividedBy(10 ** decimals)

const endpoints = {
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/opynfinance/gamma-mainnet",
};

const prices = {} as IJSON<number>
const getUnderlyingSpotPrice = async (address: string, timestamp: number) => {
    const key = `ethereum:${address}`
    if (!prices[address]) prices[address] = (await getPrices([key], timestamp))[key].price
    return prices[address]
}
const fetch: Fetch = async (timestamp) => {
    const timestampFrom = timestamp - 60 * 60 * 24
    const response = await request(endpoints[CHAIN.ETHEREUM], query, {
        timestampFrom,
        timestampTo: timestamp,
    }) as { otokenTrades: IoTokenTrade[] }
    const fetchResult: FetchResultOptions = { timestamp: timestampFrom }
    const processed = await response.otokenTrades.reduce(async (accP, curr) => {
        const acc = await accP
        const underlyingAssetSpotPrice = await getUnderlyingSpotPrice(curr.oToken.underlyingAsset.id, +curr.timestamp)
        acc.notional = acc.notional.plus(
            normalizeValues(curr.oTokenAmount, curr.oToken.decimals)
                .multipliedBy(underlyingAssetSpotPrice)
        )
        acc.premium = acc.premium.plus(normalizeValues(curr.paymentTokenAmount, curr.paymentToken.decimals))
        return acc
    }, Promise.resolve({ notional: BigNumber(0), premium: BigNumber(0) }) as Promise<{ notional: BigNumber, premium: BigNumber }>)
    fetchResult.dailyNotionalVolume = processed.notional.toString()
    fetchResult.dailyPremiumVolume = processed.premium.toString()
    return fetchResult
}

const adapter: BreakdownAdapter = {
    breakdown: {
        "gamma": {
            [CHAIN.ETHEREUM]: {
                fetch,
                start: async () => 1609200000
            }
        }
    }
};
export default adapter;
