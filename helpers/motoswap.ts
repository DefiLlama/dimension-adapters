import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";

// Shared by dexs/motoswap and fees/moto-fun: both send their protocol fee leg to the same Motoswap Collector,
// which splits every inflow across weighted buckets.
// Contracts: https://etherscan.io/address/0xC13307272bBf73f2191cE57d0Fb714C2A9200cF3 (Collector)

export const MOTO = '0xBd965230588EAA536dE6aA45E8ebbc01638535e0'
export const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const MOTO_WETH_PAIR = '0x302C53B6176F750e5547D775645dc8778524fCc1' // Motoswap MOTO/WETH pair
export const COLLECTOR = '0xC13307272bBf73f2191cE57d0Fb714C2A9200cF3'
const MOTO_STAKING = '0xCE88F2C6B49EfBb92555eE5475311f0e250C2528' // stakers of MOTO (governance token)
const BUYBACK_BURNER = '0x85B5A2800d7E2D948F21Cb8F6E610D2c9B19AE3d' // buys MOTO and burns it
const RAKEBACK = '0x89E2E1819Fc373e3cD840A0ceb2Ef1eAE79E2dB8' // RakebackV2, pays a share back to traders

export const LABELS = {
  STAKERS: 'Protocol Fees To MOTO Stakers',
  BUYBACK: 'Protocol Fees To MOTO Buyback And Burn',
  RAKEBACK: 'Protocol Fees To Trader Rakeback',
  TREASURY: 'Protocol Fees To Treasury',
}

export type CollectorSplit = { stakers: number, buyback: number, rakeback: number, treasury: number }

// Bucket weights read from the Collector at the window end (2/2/2/1 at launch on 2026-09-28:
// MotoStaking / treasury / RakebackV2 / BuybackBurner). Any recipient that is not one of the three
// protocol contracts above is the treasury.
/**
 * Reads the Collector bucket weights at the window end block (options.toApi).
 * @returns the share of each Collector inflow going to MOTO stakers, buyback and burn, Rakeback and the treasury, as fractions summing to 1
 */
export async function getCollectorSplit(options: FetchOptions): Promise<CollectorSplit> {
  const api = options.toApi
  const length = await api.call({ target: COLLECTOR, abi: 'uint256:bucketsLength' })
  const buckets = await api.multiCall({
    target: COLLECTOR,
    abi: 'function buckets(uint256) view returns (address recipient, uint96 weight, bool notify)',
    calls: Array.from({ length: Number(length) }, (_, i) => i),
  })
  const split = { stakers: 0, buyback: 0, rakeback: 0, treasury: 0 }
  let total = 0
  for (const { recipient, weight } of buckets) {
    const w = Number(weight)
    total += w
    const r = recipient.toLowerCase()
    if (r === MOTO_STAKING.toLowerCase()) split.stakers += w
    else if (r === BUYBACK_BURNER.toLowerCase()) split.buyback += w
    else if (r === RAKEBACK.toLowerCase()) split.rakeback += w
    else split.treasury += w
  }
  if (!total) throw new Error('Motoswap Collector has no buckets')
  return {
    stakers: split.stakers / total,
    buyback: split.buyback / total,
    rakeback: split.rakeback / total,
    treasury: split.treasury / total,
  }
}

// MOTO has no price on coins.llama.fi since its liquidity moved from Uniswap v2 to Motoswap (2026-09-28),
// so MOTO amounts are converted to WETH at the Motoswap MOTO/WETH pair reserves at the window end.
/**
 * Reads the Motoswap MOTO/WETH pair reserves at the window end block (options.toApi).
 * @returns a converter from a raw MOTO amount (18 decimals) to the raw WETH amount (18 decimals) at that reserve ratio
 */
export async function getMotoToWeth(options: FetchOptions): Promise<(amount: bigint) => bigint> {
  const api = options.toApi
  const token0 = await api.call({ target: MOTO_WETH_PAIR, abi: 'address:token0' })
  const reserves = await api.call({ target: MOTO_WETH_PAIR, abi: 'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)' })
  const motoIs0 = token0.toLowerCase() === MOTO.toLowerCase()
  const rMoto = BigInt(motoIs0 ? reserves.reserve0 : reserves.reserve1)
  const rWeth = BigInt(motoIs0 ? reserves.reserve1 : reserves.reserve0)
  if (rMoto === 0n) throw new Error('Motoswap MOTO/WETH pair has no reserves')
  return (amount: bigint) => amount * rWeth / rMoto
}

// Adds an amount of a quote asset, with MOTO converted to WETH.
/**
 * Adds a raw quote asset amount to balances under the label; MOTO is added as its WETH equivalent, other tokens as is.
 */
export function addQuote(balances: Balances, token: string, amount: bigint, motoToWeth: (a: bigint) => bigint, label: string) {
  if (token.toLowerCase() === MOTO.toLowerCase()) balances.add(WETH, motoToWeth(amount).toString(), label)
  else balances.add(token, amount.toString(), label)
}

// Splits protocol fees that reached the Collector into revenue / holders / protocol / supply side.
/**
 * Splits a balances object of protocol fees by the Collector split.
 * @returns four labeled clones: to stakers, to buyback and burn, to treasury, to Rakeback
 */
export function splitProtocolFees(protocolFees: Balances, split: CollectorSplit) {
  const toStakers = protocolFees.clone(split.stakers, LABELS.STAKERS)
  const toBuyback = protocolFees.clone(split.buyback, LABELS.BUYBACK)
  const toTreasury = protocolFees.clone(split.treasury, LABELS.TREASURY)
  const toRakeback = protocolFees.clone(split.rakeback, LABELS.RAKEBACK)
  return { toStakers, toBuyback, toTreasury, toRakeback }
}
