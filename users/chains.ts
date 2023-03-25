import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlocks } from "../helpers/getBlock";

const convertChain = (chain:string)=>({
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

export const users = [
    "arbitrum", "avalanche", "bsc", "ethereum", "flow", "gnosis", "near", "optimism", "osmosis", "polygon", "solana",
    // "terra2"
].map(c=>({name:c, getUsers: getUsersChain(c)}))
