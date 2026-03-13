import { queryAllium } from "../helpers/allium";
import { httpGet } from "../utils/fetchURL";
import axios from "axios";
import { getEnv } from "../helpers/env";
import { CHAIN } from "../helpers/chains";

async function solanaUsers(start: number, end: number) {
    const queryId = await queryAllium(`select count(DISTINCT signer) as usercount, count(txn_id) as txcount from solana.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end}) and success=true and is_voting=false`)
    return {
        queryId
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
        const queryId = await queryAllium(`select count(DISTINCT ${fromField}) as usercount, count(hash) as txcount from ${chain}.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return queryId
    }
}

function getAlliumNewUsersChain(chain: string) {
    return async (start: number, end: number) => {
        let fromField = chain === "starknet" ? "sender_address" : "from_address"
        const queryId = await queryAllium(`select count(DISTINCT ${fromField}) as usercount from ${chain}.raw.transactions where nonce = 0 and BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return queryId
    }
}

type ChainUserConfig = {
    name: string,
    id: string,
    chain: string,
    getUsers?: (start: number, end: number) => Promise<any>,
    getNewUsers?: (start: number, end: number) => Promise<any>,
}

const alliumChainMap: Record<string, string> = {
    arbitrum: CHAIN.ARBITRUM,
    avalanche: CHAIN.AVAX,
    ethereum: CHAIN.ETHEREUM,
    optimism: CHAIN.OPTIMISM,
    polygon: CHAIN.POLYGON,
    tron: CHAIN.TRON,
    base: CHAIN.BASE,
    scroll: CHAIN.SCROLL,
    polygon_zkevm: CHAIN.POLYGON_ZKEVM,
    bsc: CHAIN.BSC
}

const alliumExports = Object.keys(alliumChainMap).map(c => ({ name: c, id: c, getUsers: getAlliumUsersChain(c), getNewUsers: getAlliumNewUsersChain(c), chain: alliumChainMap[c], type: 'chain' }))

export default [
    {
        name: "solana",
        chain: CHAIN.SOLANA,
        getUsers: solanaUsers
    },
    {
        name: "elrond",
        chain: CHAIN.ELROND,
        getUsers: elrondUsers
    },
    // https://coverage.coinmetrics.io/asset-metrics/AdrActCnt
    {
        name: "bitcoin",
        chain: CHAIN.BITCOIN,
        getUsers: coinmetricsData("btc")
    },
    {
        name: "litecoin",
        chain: CHAIN.LITECOIN,
        getUsers: coinmetricsData("ltc")
    },
    {
        name: "cardano",
        chain: CHAIN.CARDANO,
        getUsers: coinmetricsData("ada")
    },
    {
        name: "algorand",
        chain: CHAIN.ALGORAND,
        getUsers: coinmetricsData("algo")
    },
    {
        name: "bch",
        chain: CHAIN.BITCOIN_CASH,
        getUsers: coinmetricsData("bch")
    },
    {
        name: "bsv",
        chain: CHAIN.BITCOIN_SV,
        getUsers: coinmetricsData("bsv")
    },
].map(chain => ({
    name: chain.name,
    id: (chain as any).id ?? `chain#${chain.name}`,
    type: "chain",
    chain: chain.chain,
    getUsers: (start: number, end: number) => chain.getUsers(start, end).then(u => typeof u === "object" ? u : ({ all: { users: u } })),
} as ChainUserConfig)).concat(alliumExports)
