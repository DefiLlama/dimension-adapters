import { BreakdownAdapter, FetchResult } from "../../adapters/types";
import type { ChainEndpoints, IJSON } from "../../adapters/types"
import { request, gql } from "graphql-request";
import collectionsList from './collections'
import { getUniqStartOfTodayTimestamp, getUniswapDateId } from "../../helpers/getUniSubgraph/utils";
import customBackfill from "../customBackfill";
import { Chain } from "@defillama/sdk/build/general";

interface ICollection {
    id: string
    name: string
    symbol: string
    totalSupply: string
    nftStandard: string
    royaltyFee: string
    cumulativeTradeVolumeETH: string
    marketplaceRevenueETH: string
    creatorRevenueETH: string
    totalRevenueETH: string
    tradeCount: number
    buyerCount: number
    sellerCount: number
}

interface ICollectionDailySnapshot {
    id: string
    collection: ICollection
    blockNumber: string
    timestamp: string
    royaltyFee: string
    dailyMinSalePrice: string
    dailyMaxSalePrice: string
    cumulativeTradeVolumeETH: string
    dailyTradeVolumeETH: string
    marketplaceRevenueETH: string
    creatorRevenueETH: string
    totalRevenueETH: string
    tradeCount: number
    dailyTradedItemCount: number
}
const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
const getCollectionsData = async (timestamp: number, graphUrl: string): Promise<IJSON<ICollectionDailySnapshot> | undefined> => {
    const dayId = getUniswapDateId(new Date(timestamp * 1000))
    const graphQuery = gql
        `{
      collectionDailySnapshots(
        where:{id_in: [${Object.keys(collectionsList).map(c => `"${c.toLowerCase()}-${dayId}"`).join(',')}]}
      ) {
        id
        timestamp
        collection {
          royaltyFee
          id
          name
          nftStandard
        }
        creatorRevenueETH
        totalRevenueETH
        marketplaceRevenueETH
      }
    }`;
    const graphRes = await request(graphUrl, graphQuery)
    const collections = graphRes['collectionDailySnapshots'] as ICollectionDailySnapshot[];
    if (!collections || collections.length <= 0) return undefined

    return collections.reduce((acc, curr) => ({ ...acc, [curr.collection.id]: curr }), {} as IJSON<ICollectionDailySnapshot>)
}

let collections: IJSON<IJSON<ICollectionDailySnapshot>> = {}

export const collectionFetch = (collectionId: string, graphUrl: string) => async (timestamp: number) => {
    const cleanTimestampKey = String(getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)))
    if (!collections[cleanTimestampKey]) {
        const response = await getCollectionsData(timestamp, graphUrl)
        if (response) collections[cleanTimestampKey] = response
    }
    const res = { timestamp } as FetchResult
    if (!collections[cleanTimestampKey] || !collections[cleanTimestampKey][collectionId]) {
        return res
    }
    if (collections[cleanTimestampKey][collectionId].creatorRevenueETH !== undefined) {
        res['totalUserFees'] = { [ethAddress]: collections[cleanTimestampKey][collectionId].creatorRevenueETH }
        res['totalFees'] = { [ethAddress]: collections[cleanTimestampKey][collectionId].creatorRevenueETH }
        res['totalRevenue'] = { [ethAddress]: collections[cleanTimestampKey][collectionId].creatorRevenueETH }
        res['totalProtocolRevenue'] = { [ethAddress]: collections[cleanTimestampKey][collectionId].creatorRevenueETH }
    }
    return res
}

export default (graphUrls: ChainEndpoints, start: number): BreakdownAdapter['breakdown'] => {
    return Object.entries(graphUrls).reduce((acc, [chain, graphURL], _index) => {
        Object.entries(collectionsList).forEach(([collectionID]) => {
            acc[collectionID] = {
                [chain]: {
                    fetch: collectionFetch(collectionID, graphURL),
                    start: async () => start,
                    customBackfill: customBackfill(chain as Chain, () => collectionFetch(collectionID, graphURL)),
                    meta: {
                        methodology: {
                            UserFees: "Fees paid to Opensea",
                            Fees: "All fees paid: marketplace fees (paid by buyers) + royalty fees (paid by sellers)",
                            ProtocolRevenue: "Revenue from royalties (paid by sellers)",
                            Revenue: "Revenue from royalties (paid by sellers)"
                        }
                    }
                }
            }
        });
        return acc
    }, {} as BreakdownAdapter['breakdown'])
};
