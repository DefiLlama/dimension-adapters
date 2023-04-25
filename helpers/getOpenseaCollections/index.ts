import { BreakdownAdapter, FetchResult } from "../../adapters/types";
import type { ChainEndpoints, IJSON } from "../../adapters/types"
import collectionsList from './collections'
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import postgres from "postgres";
import { ethers } from "ethers";
import seaport_abi from "./seaport_abi.json"
import BigNumber from "bignumber.js";
import { clearInterval } from "timers";

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

interface QueryTransactionResult {
    hash: string//Buffer
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

let rangeSeaportTxs: QueryTransactionResult[] | undefined
let queryStarted = false
export const collectionFetch = (collectionAddress: string, payoutAddress: string) => async (timestamp: number) => {
    // get range to search
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const startDay = new Date((todaysTimestamp - 60 * 60 * 24) * 1e3);
    const endDay = new Date(todaysTimestamp * 1e3);
    // query seaport 1.4 transactions
    if (rangeSeaportTxs === undefined && !queryStarted) {
        queryStarted = true
        const sql = postgres(process.env.INDEXA_DB!);
        rangeSeaportTxs = (await sql`
        SELECT
        encode(ethereum.transactions.hash, 'hex') as hash,
        encode(ethereum.transactions.data, 'hex') as data
        FROM ethereum.transactions
        INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
        WHERE ( to_address = '\\x00000000000001ad428e4906ae43d8f9852d0dd6'::bytea -- Seaport 1.4
        ) AND (block_time BETWEEN ${startDay.toISOString()} AND ${endDay.toISOString()});`) as QueryTransactionResult[]
        await sql.end({ timeout: 3 })
    }
    // parse transactions of that range using seaport abi
    const iface = new ethers.Interface(seaport_abi)
    // patient patientExtractFeesByPayout will await for query to finish (either in this fetch or in another collection fetch)
    const res = { timestamp } as FetchResult
    const processedFees = await patientExtractFeesByPayoutFromToken(iface, payoutAddress, collectionAddress)
    if (Object.keys(processedFees).length > 0) {
        res["dailyFees"] = processedFees
    }
    return res
}

const patientExtractFeesByPayoutFromToken = async (iface: ethers.Interface, payoutAddress: string, collectionAddress: string): Promise<IJSON<string>> => {
    return new Promise((resolve) => {
        const intervalid = setInterval(() => {
            if (rangeSeaportTxs !== undefined) {
                console.log("Start fees!")
                clearInterval(intervalid)
                const allTxs = rangeSeaportTxs.map(tx => {
                    let txhash = ''
                    try {
                        txhash = tx.hash
                        return {
                            ...iface.parseTransaction({ data: `0x${tx.data.toString('hex')}` }),
                            tx_hash: tx.hash
                        }
                    } catch (e) {
                        // Normally reverted or failed txs
                        console.error("Failed to parse transaction", txhash, (e as Error).message)
                    }
                }).filter((tx): tx is ethers.TransactionDescription & { tx_hash: string } => !!tx && Object.keys(tx).length > 1)
                // extract fees based on payoutAddress and sum them
                const allPayouts = [] as ReturnType<typeof extractFeesByPayoutAddress>
                for (const tx of allTxs) {
                    allPayouts.push(...extractFeesByPayoutAddress(tx, payoutAddress, collectionAddress))
                }
                console.log(allPayouts.length)
                resolve(allPayouts.reduce((acc, payout) => {
                    Object.entries(payout).forEach(([token, balance]) => {
                        let sum = balance
                        if (acc[token]) sum = BigNumber(acc[token]).plus(BigNumber(balance)).toString()
                        acc[token] = sum
                        return acc
                    })
                    return acc
                }, {} as IJSON<string>))
            } else {console.log("Awaiting")
            }
        }, 3000)
    });
}

const DEFAULT_OFFER_TOKEN = "0x0000000000000000000000000000000000000000"
const extractFeesByPayoutAddress = (tx: ethers.TransactionDescription, payoutAddress: string, collectionAddress: string) => {
    let considerationArr: (string | BigInt)[] | undefined
    let fee: BigNumber | undefined
    let response = [] as (IJSON<string> | undefined)[]
    try {
        switch (tx.fragment.name) {
            case "fulfillAdvancedOrder":
            case "fulfillOrder":
                response = [processAdvancedOrder(tx.args[0], payoutAddress, DEFAULT_OFFER_TOKEN, collectionAddress)]
                break
            case "fulfillAvailableOrders":
            case "fulfillAvailableAdvancedOrders":
            case "matchAdvancedOrders":
            case "matchOrders":
                const advancedOrders = [] as (IJSON<string> | undefined)[]
                tx.args[0].forEach((order: any) => {
                    advancedOrders.push(processAdvancedOrder(order, payoutAddress, DEFAULT_OFFER_TOKEN, collectionAddress))
                })
                response = advancedOrders
                break
            // This might be wrong since royalties for a creator are collected from multiple offers (two different offers different collections but same creator then it will count both royalties for one collection)
            case "fulfillBasicOrder":
                if (tx.args[0][5].toLowerCase() !== collectionAddress.toLowerCase()) break
                considerationArr = tx.args[0][16].find((consideration: (string | BigInt)[]) =>
                    consideration.filter((el): el is string => typeof el === 'string').map(el => el.toLowerCase()).includes(payoutAddress.toLowerCase())
                )
                if (considerationArr) {
                    fee = BigNumber(considerationArr[0] as string) // its BigInt but ts complains bc current target has no BigInt support
                    response = [{
                        [tx.args[0][0]]: fee.dividedBy(1e18).toString()
                    }]
                }
                break
            case "fulfillBasicOrder_efficient_6GL6yc":
                if (tx.args[0][5].toLowerCase() !== collectionAddress.toLowerCase()) break
                considerationArr = tx.args[0][16].find((consideration: (string | BigInt)[]) =>
                    consideration.filter((el): el is string => typeof el === 'string').map(el => el.toLowerCase()).includes(payoutAddress.toLowerCase())
                )
                if (considerationArr) {
                    fee = BigNumber(considerationArr[0] as string) // its BigInt but ts complains bc current target has no BigInt support
                    response = [{
                        [tx.args[0][0]]: fee.dividedBy(1e18).toString()
                    }]
                }
                break
            default:
                response = []
                break
        }
    } catch (error) {
        // @ts-ignore
        console.error("Error processing tx (", tx.fragment.name, ") with hash", tx.tx_hash, ", with error", error.message, "and body", tx.args[0][1])
    }
    return response.filter((el): el is IJSON<string> => el !== undefined)
}


const processAdvancedOrder = (order: any, payoutAddress: string, offerToken: string, collectionAddress: string) => {
    if (!order[0][2].some((offer: any[]) => offer[1].toLowerCase() === collectionAddress.toLowerCase())) return undefined
    const considerationArr = order[0][3].find((consideration: (string | BigInt)[]) =>
        consideration.filter((el): el is string => typeof el === 'string').map(el => el.toLowerCase()).includes(payoutAddress.toLowerCase())
    )
    if (!considerationArr) return undefined
    const fee = BigNumber(considerationArr[4])
    return {
        [offerToken]: fee.dividedBy(1e18).toString()
    }
}

export default (graphUrls: ChainEndpoints, start: number): BreakdownAdapter['breakdown'] => {
    const graphUrlsEntries = Object.entries(graphUrls)
    return Object.entries(collectionsList).reduce((acc, [collectionAddress, { payoutAddress }]) => {
        for (const [chain, graphURL] of graphUrlsEntries) {
            acc[collectionAddress] = {
                [chain]: {
                    fetch: collectionFetch(collectionAddress, payoutAddress),
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
        }
        return acc
    }, {} as BreakdownAdapter['breakdown'])
};
