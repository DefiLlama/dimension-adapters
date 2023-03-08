import { ChainBlocks } from "../adapters/types";
import axios from "axios"
import { providers } from "@defillama/sdk/build/general"
import type { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "./chains";
// import * as sdk from "@defillama/sdk"
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
        else if (chain === CHAIN.MOONRIVER)
            block = Number((await retry(async () => (await axios.get(`https://blockscout.moonriver.moonbeam.network/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.result?.blockNumber)));
        else
            block = Number((await retry(async () => (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`).catch((e) => {
                throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
            }))?.data?.height)));
        if (block) chainBlocks[chain] = block
        return block
        //return sdk.api.util.lookupBlock(timestamp, { chain }).then(blockData => blockData.block)
    }
}

const canGetBlock = (chain: string) => Object.keys(providers).includes(chain)

export {
    getBlock,
    canGetBlock
}
