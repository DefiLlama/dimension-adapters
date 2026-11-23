import { Balances } from "@defillama/sdk";
import ADDRESSES from './coreAssets.json'
import { FetchOptions } from "../adapters/types";

// Quote tokens of four.meme curves (listed at https://four.meme/meme-api/v1/public/rwa/config) that DefiLlama's price server
// does not know. Each is valued at the spot price of its main PancakeSwap v3 pool at the end of the window. In both pools the
// quote token is token0, the dollar token is token1, and both have 18 decimals.
const UNPRICED_QUOTES = [
  { token: '0x6a2b0b704650a93f7495d728c3b851a1c5f73172', pool: '0x83d26894f65191566c4293118c1bfccf5b899195', dollar: '0xce24439f2d9c6a2289f741120fe202248b666666' }, // RYDE4/U
  { token: '0x38dd26788cf2d901e3abf04efe3007d459d0fc53', pool: '0x5afb6e189a268c6adfc9da13ca13e3ba91171a31', dollar: ADDRESSES.bsc.USDT }, // ANTB/USDT
]
const SLOT0 = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)'

// Replaces those tokens, in place and under their labels, with the same value in the pool's dollar token.
export async function convertUnpricedQuotes(options: FetchOptions, balances: Balances[]) {
  const parts = balances.flatMap((b) => [b, ...Object.values(b.getBreakdownBalances())])
  for (const { token, pool, dollar } of UNPRICED_QUOTES) {
    const held = parts.flatMap((part) => Object.keys(part.getBalances())
      .filter((key) => key.toLowerCase() === `${options.chain}:${token}`)
      .map((key) => ({ part, key })))
    if (!held.length) continue
    const { sqrtPriceX96 } = await options.api.call({ target: pool, abi: SLOT0 })
    const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2
    held.forEach(({ part, key }) => {
      const balance = part.getBalances()
      part.add(dollar, Number(balance[key]) * price)
      delete balance[key]
    })
  }
}
