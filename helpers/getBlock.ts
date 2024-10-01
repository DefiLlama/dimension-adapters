import { ChainBlocks } from "../adapters/types";
import { providers } from "@defillama/sdk/build/general"
import type { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "./chains";
import * as sdk from "@defillama/sdk"
import { httpGet } from "../utils/fetchURL";
const retry = require("async-retry")

const blacklistedChains: string[] = [
  "juno",
  "cardano",
  "litecoin",
  "bitcoin",
  "tezos",
  "solana",
  "elrond",
  "defichain",
  "stacks",
  "KARURA",
  "hedera",
  "eos",
  "icon",
  "stellar",
  "algorand",
  "mixin",
  "thorchain",
  "flow",
  "aptos",
  "polkadex",
  "neo",
  "phantasma",
  "starknet",
  "carbon",
  "vechain",
  "wax",
  "injective",
  "ton",
  "obyte",
  "sora",
  "cosmos",
  "hydra",
  "icp",
  "hydradx",
  "osmosis",
  "ergo",
  "radixdlt",
  "near",
  "persistence",
  "sui",
  "neutron",
  "terra2",
  "dymension"
];

const cache = {

} as any

async function getBlock(timestamp: number, chain: Chain, chainBlocks = {} as ChainBlocks) {
  try {
    if (!cache[chain]) cache[chain] = {}
    if (!cache[chain][timestamp]) cache[chain][timestamp] = _getBlock(timestamp, chain, {})
    const block = await cache[chain][timestamp]
    if (block) chainBlocks[chain] = block
    return block
  } catch (e) {
    console.error('error fetching block' + chain + ' ' + (e as any)?.message)
    return null
  }
}

async function _getBlock(timestamp: number, chain: Chain, chainBlocks = {} as ChainBlocks) {
  if (chain === CHAIN.DOGECHAIN) throw new Error("DOGECHAIN not supported")
  if (blacklistedChains.includes(chain)) {
    return null
  }
  if (chainBlocks[chain] !== undefined)
    return chainBlocks[chain]



  let block: number | undefined
  try {
    if (chain === CHAIN.WAVES)
      timestamp = Math.floor(timestamp * 1000)
    block = await sdk.blocks.getBlockNumber(chain, timestamp)
  } catch (e) {
    if (chain === CHAIN.SEI) {
      return null
    }
    console.log('error fetching block', e)
  }

  if (block) {
    chainBlocks[chain] = block
    return block
  }

  if (chain === CHAIN.CELO)
    block = Number((await retry(async () => (await httpGet("https://explorer.celo.org/api?module=block&action=getblocknobytime&timestamp=" + timestamp + "&closest=before").catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.result?.blockNumber, { retries: 3 })));
  else if (chain === CHAIN.ONUS)
    block = Number((await retry(async () => (await httpGet(`https://explorer.onuschain.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.result?.blockNumber, { retries: 3 })));
  else if (chain as CHAIN === CHAIN.POLYGON_ZKEVM || chain === CHAIN.VISION || chain as CHAIN === CHAIN.ERA)
    return sdk.api.util.lookupBlock(timestamp, { chain }).then((blockData: any) => blockData.block) // TODO after get block support chain  polygon_zkevm then swith to use api https://coins.llama.fi/block
  else if (chain as CHAIN === CHAIN.WAVES)
    block = Number((await retry(async () => (await httpGet(`https://nodes.wavesnodes.com/blocks/heightByTimestamp/${(timestamp * 1000)}`).catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.height, { retries: 3 })));
  else if (chain === CHAIN.BASE)
    block = Number((await retry(async () => (await httpGet(`https://base.blockscout.com/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.result?.blockNumber, { retries: 3 })));
  else if (chain === CHAIN.SCROLL)
    block = Number((await retry(async () => (await httpGet(`https://blockscout.scroll.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`).catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.result?.blockNumber, { retries: 3 })));
  else
    block = Number((await retry(async () => (await httpGet(`https://coins.llama.fi/block/${chain}/${timestamp}`, { timeout: 10000 }).catch((e) => {
      throw new Error(`Error getting block: ${chain} ${timestamp} ${e.message}`)
    }))?.height, { retries: 1 })));
  if (block) chainBlocks[chain] = block
  return block
  // https://base.blockscout.com
  // https://explorer.kava.io
  //return sdk.api.util.lookupBlock(timestamp, { chain }).then(blockData => blockData.block)

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
