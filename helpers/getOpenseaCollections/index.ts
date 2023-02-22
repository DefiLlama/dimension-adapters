import { BreakdownAdapter, FetchResult } from "../../adapters/types";
import type { ChainEndpoints, IJSON } from "../../adapters/types"
import { request, gql } from "graphql-request";
import collectionsList from './collections'
import { getUniswapDateId } from "../../helpers/getUniSubgraph/utils";

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

let collections: IJSON<ICollectionDailySnapshot> | undefined = undefined

export const collectionFetch = (collectionId: string, graphUrl: string) => async (timestamp: number) => {
    if (!collections) {
        collections = await getCollectionsData(timestamp, graphUrl)
    }
    const res = { timestamp } as FetchResult
    if (!collections || !collections[collectionId]) {
        return res
    }
    if (collections[collectionId].marketplaceRevenueETH !== undefined) {
        res['dailyUserFees'] = { [ethAddress]: collections[collectionId].marketplaceRevenueETH }
    }
    if (collections[collectionId].marketplaceRevenueETH !== undefined) {
        res['dailyFees'] = { [ethAddress]: collections[collectionId].totalRevenueETH }
    }
    if (collections[collectionId].creatorRevenueETH !== undefined) {
        res['dailyRevenue'] = { [ethAddress]: collections[collectionId].creatorRevenueETH }
        res['dailyProtocolRevenue'] = { [ethAddress]: collections[collectionId].creatorRevenueETH }
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
