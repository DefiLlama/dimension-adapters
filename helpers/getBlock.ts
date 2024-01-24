import { ChainBlocks } from "../adapters/types";
import axios from "axios"
import { providers } from "@defillama/sdk/build/general"
import type { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "./chains";
import * as sdk from "@defillama/sdk"
const retry = require("async-retry")

async function getBlock(timestamp: number, chain: Chain, chainBlocks: ChainBlocks) {
    if (chainBlocks[chain] !== undefined) {
        return chainBlocks[chain]
    } else {
        let block: number | undefined = undefined
        if (chain === CHAIN.CELO)
            block = Number((await retry(async () => (await axios.get("https://explorer.celo.org/api?module=block&action=getblocknobytime&timestamp=" + timestamp + "&closest=before").catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else if (chain === CHAIN.KAVA)
            block = Number((await retry(async () => (await axios.get(`https://explorer.kava.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
                console.log(`Error getting block: ${chain} ${timestamp} ${e.message}`)
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else if (chain === CHAIN.ONUS)
            block = Number((await retry(async () => (await axios.get(`https://explorer.onuschain.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else if (chain as CHAIN === CHAIN.POLYGON_ZKEVM || chain === CHAIN.VISION || chain as CHAIN === CHAIN.ERA)
            return sdk.api.util.lookupBlock(timestamp, { chain }).then((blockData: any) => blockData.block) // TODO after get block support chain  polygon_zkevm then swith to use api https://coins.llama.fi/block
        else if (chain as CHAIN === CHAIN.WAVES)
            block = Number((await retry(async () => (await axios.get(`https://nodes.wavesnodes.com/blocks/heightByTimestamp/${timestamp}`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.height)));
        else if (chain === CHAIN.BASE)
            block = Number((await retry(async () => (await axios.get(`https://base.blockscout.com/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else if (chain === CHAIN.SCROLL)
            block = Number((await retry(async () => (await axios.get(`https://blockscout.scroll.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else
            block = Number((await retry(async () => (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`).catch((e) => {
                console.log(`Error getting block: ${chain} ${timestamp} ${e.message}`)
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.height, { retries: 3 })));
        if (block) chainBlocks[chain] = block
        return block
        // https://base.blockscout.com
        // https://explorer.kava.io
        //return sdk.api.util.lookupBlock(timestamp, { chain }).then(blockData => blockData.block)
    }
}

async function getBlocks(chain: Chain, timestamps: number[]) {
    return Promise.all(timestamps.map(t => getBlock(t, chain, {})))
}

const canGetBlock = (chain: string) => Object.keys(providers).includes(chain)

export {
    getBlock,
    canGetBlock,
    getBlocks
}
