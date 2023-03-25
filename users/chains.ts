import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlocks } from "../helpers/getBlock";

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
    }
])
