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

const toDateString = (d: number) => new Date(d * 1e3).toISOString().slice(0, 10)
type BlockscoutStatsChartItem = {
    date: string,
    date_to: string,
    value: string,
}

// Blockscout stats-service exposes daily tx, active account, and new account series.
function getBlockscoutUsersChain(baseUrl: string) {
    return async (start: number, end: number) => {
        const from = toDateString(start)
        const to = toDateString(end - 1)

        const [txData, userData] = await Promise.all([
            httpGet(`${baseUrl}/stats-service/api/v1/lines/newTxns?from=${from}&to=${to}&resolution=DAY`),
            httpGet(`${baseUrl}/stats-service/api/v1/lines/activeAccounts?from=${from}&to=${to}&resolution=DAY`),
        ])

        const txPoint = (txData.chart as BlockscoutStatsChartItem[]).find((item) => item.date === from)
        const userPoint = (userData.chart as BlockscoutStatsChartItem[]).find((item) => item.date === from)
        const txcount = Number(txPoint?.value)
        const usercount = Number(userPoint?.value)

        if (!txPoint || !userPoint || !Number.isFinite(txcount) || !Number.isFinite(usercount))
            throw new Error(`Malformed Blockscout stats payload for ${baseUrl} on ${from}`)

        return [{
            usercount,
            txcount,
        }]
    }
}

// New-user coverage comes from the dedicated newAccounts series.
function getBlockscoutNewUsersChain(baseUrl: string) {
    return async (start: number, end: number) => {
        const from = toDateString(start)
        const to = toDateString(end - 1)

        const newUserData = await httpGet(`${baseUrl}/stats-service/api/v1/lines/newAccounts?from=${from}&to=${to}&resolution=DAY`)
        const newUserPoint = (newUserData.chart as BlockscoutStatsChartItem[]).find((item) => item.date === from)
        const usercount = Number(newUserPoint?.value)

        if (!newUserPoint || !Number.isFinite(usercount))
            throw new Error(`Malformed Blockscout new users payload for ${baseUrl} on ${from}`)

        return [{
            usercount,
        }]
    }
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

const blockscoutChainMap: Record<string, { chain: string, baseUrl: string }> = {
    astar: { chain: CHAIN.ASTAR, baseUrl: "https://astar.blockscout.com" },
    filecoin: { chain: CHAIN.FILECOIN, baseUrl: "https://filecoin.blockscout.com" },
    fuse: { chain: CHAIN.FUSE, baseUrl: "https://explorer.fuse.io" },
    ink: { chain: CHAIN.INK, baseUrl: "https://explorer.inkonchain.com" },
    lightlink_phoenix: { chain: CHAIN.LIGHTLINK_PHOENIX, baseUrl: "https://phoenix.lightlink.io" },
    lisk: { chain: CHAIN.LISK, baseUrl: "https://blockscout.lisk.com" },
    optimism: { chain: CHAIN.OPTIMISM, baseUrl: "https://explorer.optimism.io" },
    redstone: { chain: CHAIN.REDSTONE, baseUrl: "https://explorer.redstone.xyz" },
    rootstock: { chain: CHAIN.ROOTSTOCK, baseUrl: "https://rootstock.blockscout.com" },
    soneium: { chain: CHAIN.SONEIUM, baseUrl: "https://soneium.blockscout.com" },
    unichain: { chain: CHAIN.UNICHAIN, baseUrl: "https://unichain.blockscout.com" },
    zksync: { chain: CHAIN.ZKSYNC, baseUrl: "https://zksync.blockscout.com" },
}

const blockscoutExports = Object.entries(blockscoutChainMap).map(([name, config]) => ({
    name,
    id: name,
    getUsers: getBlockscoutUsersChain(config.baseUrl),
    getNewUsers: getBlockscoutNewUsersChain(config.baseUrl),
    chain: config.chain,
    type: 'chain'
}))

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
} as ChainUserConfig)).concat(alliumExports, blockscoutExports)
