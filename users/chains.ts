import { queryAllium } from "../helpers/allium";
import fetchURL, { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

async function solanaUsers(start: number, end: number) {
    const queryId = await queryAllium(`select count(DISTINCT signer) as usercount, count(txn_id) as txcount from solana.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end}) and success=true and is_voting=false`)
    return queryId
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
        const activeUsersResult = (await httpGet(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=AdrActCnt&assets=${assetID}&start_time=${toIso(start - 24 * 3600)}&end_time=${toIso(end + 24 * 3600)}`)).data;
        const txcountResult = (await httpGet(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=TxCnt&assets=${assetID}&start_time=${toIso(start - 24 * 3600)}&end_time=${toIso(end + 24 * 3600)}`)).data;

        const activeUsersClosestDatapoint = findClosestItem(activeUsersResult, start, t => t.time)
        const txcountClosestDatapoint = findClosestItem(txcountResult, start, t => t.time)

        if (!activeUsersClosestDatapoint || !txcountClosestDatapoint) {
            throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${end}, no data`);
        }

        const activeUsers = parseFloat(activeUsersClosestDatapoint['AdrActCnt']);
        const txcount = parseFloat(txcountClosestDatapoint['TxCnt']);
        
        return [{
            usercount: activeUsers,
            txcount: txcount,
        }];
    }
}

async function elrondUsers(start: number, end: number) {
    const usersResult = await fetchURL(`https://tools.multiversx.com/growth-api/explorer/analytics/active-users?range=all`)
    const usersDataToday = usersResult.data.find((d: any) => d.timestamp >= start && d.timestamp < end)
    const txcountResult = await fetchURL(`https://tools.multiversx.com/growth-api/explorer/analytics/token-transfers?range=all`)
    const txcountDataToday = txcountResult.data.find((d: any) => d.timestamp >= start && d.timestamp < end)
    return [{
        usercount: usersDataToday.value,
        txcount: txcountDataToday.value,
    }];
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
    bsc: CHAIN.BSC,
    megaeth: CHAIN.MEGAETH,
    katana: CHAIN.KATANA,
}

const alliumExports = Object.keys(alliumChainMap).map(c => ({ name: c, id: c, getUsers: getAlliumUsersChain(c), getNewUsers: getAlliumNewUsersChain(c), chain: alliumChainMap[c], type: 'chain' }))

export default [
    {
        name: "solana",
        chain: CHAIN.SOLANA,
        getUsers: solanaUsers,
        id: "solana"
    },
    {
        name: "elrond",
        chain: CHAIN.ELROND,
        getUsers: elrondUsers,
        id: "elrond"
    },
    // https://coverage.coinmetrics.io/asset-metrics/AdrActCnt
    {
        name: "bitcoin",
        chain: CHAIN.BITCOIN,
        getUsers: coinmetricsData("btc"),
        id: "bitcoin"
    },
    {
        name: "litecoin",
        chain: CHAIN.LITECOIN,
        getUsers: coinmetricsData("ltc"),
        id: "litecoin"
    },
    {
        name: "cardano",
        chain: CHAIN.CARDANO,
        getUsers: coinmetricsData("ada"),
        id: "cardano"
    },
    {
        name: "algorand",
        chain: CHAIN.ALGORAND,
        getUsers: coinmetricsData("algo"),
        id: "algorand"
    },
    {
        name: "bch",
        chain: CHAIN.BITCOIN_CASH,
        getUsers: coinmetricsData("bch"),
        id: "bch"
    },
    // {
    //     name: "bsv",
    //     chain: CHAIN.BITCOIN_SV,
    //     getUsers: coinmetricsData("bsv"),
    //     id: "bsv"
    // },
].map(chain => ({
    name: chain.name,
    id: (chain as any).id ?? `chain#${chain.name}`,
    type: "chain",
    chain: chain.chain,
    getUsers: (start: number, end: number) => chain.getUsers(start, end).then(u => typeof u === "object" ? u : ({ all: { users: u } })),
} as ChainUserConfig)).concat(alliumExports)
