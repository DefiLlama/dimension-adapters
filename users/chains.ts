import { queryFlipside } from "../helpers/flipsidecrypto";
import { queryAllium, startAlliumQuery } from "../helpers/allium";
import { httpGet } from "../utils/fetchURL";
import axios from "axios";
import { getEnv } from "../helpers/env";


function getUsersChain(chain: string) {
    return async (start: number, end: number) => {
        const query = await queryFlipside(`select count(DISTINCT FROM_ADDRESS), count(tx_hash) from ${chain}.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return {
            all: {
                users: query[0][0],
                txs: query[0][1]
            }
        }
    }
}

async function solanaUsers(start: number, end: number) {
    const queryId = await startAlliumQuery(`select count(DISTINCT signer) as usercount, count(txn_id) as txcount from solana.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end}) and success=true and is_voting=false`)
    return {
        queryId
    }
}

/*
async function solanaUsers(start: number, _end: number) {
    const usersQuery = await request("https://api-solalpha.solscan.io/api/graphql", gql`
    query allAccountOverviewDailys($date_lt: String) {
        allAccountOverviewDailys(date_lt: $date_lt, LIMIT: -1, SORT: {date: 1}) {
            AccountOverviewDailys {
                date
                num_signer_account
            }
        },
        allTransactionOverviewDailys(date_lt: $date_lt, LIMIT: -1) {
            TransactionOverviewDailys {
                date
                non_vote_num_trans
            }
        }
    }
    `, {
        Headers: {
            origin: "https://analytics.solscan.io",
            referer: "https://analytics.solscan.io/",
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36"
        }
    })
    const startDate = new Date(start*1e3).toISOString().slice(0, "2023-08-31".length)
    const findDay = (dailys:any[]) => dailys.find(d=>d.date === startDate)
    return {
        all: {
            users: findDay(usersQuery.allAccountOverviewDailys).num_signer_account,
            txs: findDay(usersQuery.allTransactionOverviewDailys).non_vote_num_trans
        }
    }
}
*/

async function osmosis(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_FROM), count(tx_id) from osmosis.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return {
        all: {
            users: query[0][0],
            txs: query[0][1]
        }
    }
}

async function near(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_SIGNER), count(tx_hash) from near.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return {
        all: {
            users: query[0][0],
            txs: query[0][1]
        }
    }
}

const timeDif = (d: string, t: number) => Math.abs(new Date(d).getTime() - new Date(t * 1e3).getTime())
function findClosestItem(results: any[], timestamp: number, getTimestamp: (x: any) => string) {
    return results.reduce((acc: any, t: any) => {
        if (timeDif(getTimestamp(t), timestamp) < timeDif(getTimestamp(acc), timestamp)) {
            return t
        } else {
            return acc
        }
    }, results[0])
}


const toIso = (d: number) => new Date(d * 1e3).toISOString()
function coinmetricsData(assetID: string) {
    return async (start: number, end: number) => {
        const result = (await httpGet(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=AdrActCnt&assets=${assetID}&start_time=${toIso(start - 24 * 3600)}&end_time=${toIso(end + 24 * 3600)}`)).data;
        const closestDatapoint = findClosestItem(result, start, t => t.time)
        if (!closestDatapoint) {
            throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${end}, no data`);
        }

        return parseFloat(closestDatapoint['AdrActCnt']);
    }
}

/*
// https://tronscan.org/#/data/stats2/accounts/activeAccounts
async function tronscan(start: number, _end: number) {
    const results = (await httpGet(`https://apilist.tronscanapi.com/api/account/active_statistic?type=day&start_timestamp=${(start - 2*24*3600)*1e3}`)).data;
    return findClosestItem(results, start, t=>t.day_time).active_count
}
*/

// not used because coinmetrics does some deduplication between users
async function bitcoinUsers(start: number, end: number) {
    const query = await queryAllium(`select count(DISTINCT SPENT_UTXO_ID) as usercount from bitcoin.raw.inputs where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return query[0].usercount
}

async function elrondUsers(start: number) {
    const startDate = new Date(start * 1e3).toISOString().slice(0, 10)
    const endDate = new Date((start + 86400) * 1e3).toISOString().slice(0, 10)
    const { data } = await axios.get(`https://tools.multiversx.com/data-api-v2/accounts/count?startDate=${startDate}&endDate=${endDate}&resolution=day`, {
        headers: {
            "x-api-key": getEnv('MULTIVERSX_USERS_API_KEY')
        }
    })
    const { value } = data.find((d: any) => d.date.slice(0, 10) === startDate) 
    return value
}

function getAlliumUsersChain(chain: string) {
    return async (start: number, end: number) => {
        let fromField = chain === "starknet" ? "sender_address" : "from_address"
        const queryId = await startAlliumQuery(`select count(DISTINCT ${fromField}) as usercount, count(hash) as txcount from ${chain}.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return {
            queryId
        }
    }
}

function getAlliumNewUsersChain(chain: string) {
    return async (start: number, end: number) => {
        let fromField = chain === "starknet" ? "sender_address" : "from_address"
        const queryId = await startAlliumQuery(`select count(DISTINCT ${fromField}) as usercount from ${chain}.raw.transactions where nonce = 0 and BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return {
            queryId
        }
    }
}

type ChainUserConfig = {
    name: string,
    id: string,
    getUsers?: (start: number, end: number) => Promise<any>,
    getNewUsers?: (start: number, end: number) => Promise<any>,
}

const alliumChains = ["arbitrum", "avalanche", "ethereum", "optimism", "polygon", "tron", "base", "scroll", "polygon_zkevm", "bsc"]

const alliumExports = alliumChains.map(c => ({ name: c, id: `chain#${c}`, getUsers: getAlliumUsersChain(c), getNewUsers: getAlliumNewUsersChain(c) }))

export default [
    // disable flipside chains
    /*
    ...([
        "gnosis"
        // "terra2", "flow"
    ].map(c => ({ name: c, getUsers: getUsersChain(c) }))),
    {
        name: "osmosis",
        getUsers: osmosis
    },
    {
        name: "near",
        getUsers: near
    },
    */
    {
        name: "solana",
        getUsers: solanaUsers
    },
    {
        name: "elrond",
        getUsers: elrondUsers
    },
    // https://coverage.coinmetrics.io/asset-metrics/AdrActCnt
    {
        name: "bitcoin",
        getUsers: coinmetricsData("btc")
    },
    {
        name: "litecoin",
        getUsers: coinmetricsData("ltc")
    },
    {
        name: "cardano",
        getUsers: coinmetricsData("ada")
    },
    {
        name: "algorand",
        getUsers: coinmetricsData("algo")
    },
    {
        name: "bch",
        getUsers: coinmetricsData("bch")
    },
    {
        name: "bsv",
        getUsers: coinmetricsData("bsv")
    },
].map(chain => ({
    name: chain.name,
    id: (chain as any).id ?? `chain#${chain.name}`,
    getUsers: (start: number, end: number) => chain.getUsers(start, end).then(u => typeof u === "object" ? u : ({ all: { users: u } })),
} as ChainUserConfig)).concat(alliumExports)
