import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlocks } from "../helpers/getBlock";
import axios from 'axios';

const convertChain = (chain: string) => ({
    gnosis: "xdai",
    avalanche: "avax"
}[chain] ?? chain)

function getUsersChain(chain: string) {
    return async (start: number, end: number) => {
        const [startBlock, endBlock] = await getBlocks(convertChain(chain), [start, end])
        const query = await queryFlipside(`select count(DISTINCT FROM_ADDRESS) from ${chain}.core.fact_transactions where BLOCK_NUMBER > ${startBlock} AND BLOCK_NUMBER < ${endBlock}`)
        return query[0][0]
    }
}

async function solanaUsers(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT SIGNERS[0]) from solana.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return query[0][0]
}

/*
// https://tronscan.org/#/data/stats2/accounts/activeAccounts
async function tronscan(start: number, end: number) {
    // unsure about methodology being used so not included for now
}
*/

async function osmosis(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_FROM) from osmosis.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return query[0][0]
}

async function near(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_SIGNER) from near.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return query[0][0]
}

const toIso = (d:number) => new Date(d*1e3).toISOString()
const timeDif = (d:string, t:number) => Math.abs(new Date(d).getTime() - new Date(t*1e3).getTime())
function coinmetricsData(assetID: string) {
    return async (start: number, end: number) => {
        const result = (await axios.get(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=AdrActCnt&assets=${assetID}&start_time=${toIso(start - 24*3600)}&end_time=${toIso(end + 24*3600)}`)).data.data;
        const closestDatapooint = result.reduce((acc:any, t:any)=>{
            if(timeDif(t.time, start) < timeDif(acc.time, start)){
                return t
            } else {
                return acc
            }
        }, result[0])
        if (!closestDatapooint) {
            throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${end}, no data`);
        }

        return parseFloat(closestDatapooint['AdrActCnt']);
    }
}


export const users = [
    "arbitrum", "avalanche", "bsc", "ethereum", "gnosis", "optimism", "polygon",
    // "terra2", "flow"
].map(c => ({ name: c, getUsers: getUsersChain(c) })).concat([
    {
        name: "solana",
        getUsers: solanaUsers
    },
    {
        name: "osmosis",
        getUsers: osmosis
    },
    {
        name: "near",
        getUsers: near
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
])
