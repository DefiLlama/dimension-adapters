import { BreakdownAdapter, FetchResult } from "../../adapters/types";
import type { ChainEndpoints, IJSON } from "../../adapters/types"
import { request, gql } from "graphql-request";
import collectionsList from './collections'
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import customBackfill from "../customBackfill";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../getBlock";
import postgres from "postgres";
import { ethers } from "ethers";
import seaport_abi from "./seaport_abi.json"

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
const getCollectionsData = async (timestamp: number, graphUrl: string): Promise<IJSON<ICollection> | undefined> => {
    const blockTimestamp = await getBlock(timestamp, 'ethereum', {});
    const graphQuery = gql
        `
        {
            collections(
              where: {id_in: ["${Object.keys(collectionsList).map(c => c.toLowerCase()).join('","')}"]}
              block: {number: ${blockTimestamp}}
            ) {
              id
              royaltyFee
              creatorRevenueETH
              totalRevenueETH
              marketplaceRevenueETH
            }
          }`;
    const graphRes = await request(graphUrl, graphQuery)
    const collections = graphRes['collections'] as ICollection[];
    if (!collections || collections.length <= 0) return undefined

    return collections.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {} as IJSON<ICollection>)
}

let collections: IJSON<IJSON<ICollection>> = {}

/* export const collectionFetch = (collectionId: string, graphUrl: string) => async (timestamp: number) => {
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
} */

interface QueryTransactionResult {
    hash: Buffer
    is_confirmed: boolean,
    success: boolean,
    error_message: null,
    block_number: string
    transaction_index: string
    block_time: Date
    block_hash: Buffer
    from_address: Buffer
    nonce: Buffer
    to_address: Buffer
    created_contract_address: null,
    value: string
    type: string
    max_priority_fee_per_gas: string
    max_fee_per_gas: string
    gas_price: string
    gas_used: string
    gas_limit: string
    block_base_fee_per_gas: string
    fee: string
    fees_burned: string
    fees_rewarded: string
    data: Buffer // its Buffer but ts complains
    number: string
    time: Date
    transaction_count: string
    miner: Buffer
    block_reward: string
    uncle_reward: string
    size: string
    base_fee_per_gas: string
    issuance: string
    total_fees: string
    extra_data: Buffer
    difficulty: string
    total_difficulty: string
    parent_hash: Buffer
    sha3_uncles: Buffer
    state_root: Buffer
    is_finalized: boolean,
    price: string
}


const payoutAddress = "0xf3b985336fd574a0aa6e02cbe61c609861e923d6"
export const collectionFetch = (_collectionId: string, _graphUrl: string) => async (timestamp: number) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const sql = postgres(process.env.INDEXA_DB!);
    const startDay = new Date((todaysTimestamp - 60 * 60 * 24) * 1e3);
    const endDay = new Date((todaysTimestamp + 60 * 60 * 24 * 2) * 1e3);
    const rangeSeaportTxs = (await sql`
      SELECT
        *
      FROM ethereum.transactions
        INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
      WHERE ( to_address = '\\x00000000000001ad428e4906ae43d8f9852d0dd6'::bytea -- Seaport 1.4
      ) AND (block_time BETWEEN ${startDay.toISOString()} AND ${endDay.toISOString()});`) as QueryTransactionResult[]

    const allNames = [] as string[]
    const iface = new ethers.Interface(seaport_abi)
    for (let tx of rangeSeaportTxs) {
        try {
            const uh = iface.parseTransaction({ data: `0x${tx.data.toString('hex')}` })
            if (!allNames.includes(uh?.fragment.name ?? ''))
                allNames.push([uh?.fragment.name ?? '', 2])
            //console.log(uh?.args[0][16].find(([_amount, addr]: [number, string]) => payoutAddress.toLowerCase() === addr.toLowerCase()))
        } catch (error) {
            console.log(error)
        }
    }
    console.log(allNames)
    const res = { timestamp } as FetchResult
    return res
}

export default (graphUrls: ChainEndpoints, start: number): BreakdownAdapter['breakdown'] => {
    return Object.entries(graphUrls).reduce((acc, [chain, graphURL], _index) => {
        ["Object.keys(collectionsList)"].forEach((collectionID) => {
            acc[collectionID] = {
                [chain]: {
                    fetch: collectionFetch(collectionID, graphURL),
                    start: async () => start,
                    // customBackfill: customBackfill(chain as Chain, () => collectionFetch(collectionID, graphURL)),
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
