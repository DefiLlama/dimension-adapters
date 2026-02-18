import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b'
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const ETH_USD_FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'

const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  USDS: '0x820c137fa70c8691f0e44dc420a5e53c168921dc',
}

const POOLS = [
  { id: '0x71c06960eee8003ebf3f869caa480d7032c7088850d951f04de5b46d86ada017', token: TOKENS.WETH },
  { id: '0xaf9168a5026bd5e398863dc1d0a0513fe21417792f9df4889571fd68d2d8cd71', token: TOKENS.USDS },
]

const HOOKS = [
  '0x831cfdf7c0e194f5369f204b3dd2481b843d60c0',
  '0x0e4b892df7c5bcf5010faf4aa106074e555660c0',
]

const WRAPPERS = [
  { address: '0xf62bca61Fe33f166791c3c6989b0929CCaaDA5B2', underlying: TOKENS.USDC },
  { address: '0x59f5245129faBEde6FC4243518B74b1DF78A2D9E', underlying: TOKENS.WETH },
  { address: '0xc7b9A2146E9c7F081C84D20626641fc59F3d4cab', underlying: TOKENS.USDS },
]

function decodeInt128(hex: string): bigint {
  const val = BigInt(hex)
  return val >= (1n << 127n) ? val - (1n << 128n) : val
}

async function calculateLendingYield(fromApi: any, toApi: any, ethPrice: number, usdsPrice: number): Promise<number> {
  let totalYieldUsd = 0
  const oneShare = (10n ** 18n).toString()

  for (const wrapper of WRAPPERS) {
    for (const hook of HOOKS) {
      try {
        const sharesEnd = await toApi.call({ abi: 'erc20:balanceOf', target: wrapper.address, params: [hook] })
        if (BigInt(sharesEnd) === 0n) continue

        const [priceStart, priceEnd] = await Promise.all([
          fromApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [oneShare] }),
          toApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [oneShare] }),
        ])

        if (Number(priceStart) === 0) continue
        const appreciationRate = (Number(priceEnd) - Number(priceStart)) / Number(priceStart)

        const assetsEnd = await toApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [sharesEnd] })
        const decimals = await toApi.call({ abi: 'function decimals() view returns (uint8)', target: wrapper.address })
        const assetsInTokens = Number(assetsEnd) / (10 ** Number(decimals))

        let assetsUsd = assetsInTokens
        if (wrapper.underlying.toLowerCase() === TOKENS.WETH.toLowerCase()) assetsUsd = assetsInTokens * ethPrice
        else if (wrapper.underlying.toLowerCase() === TOKENS.USDS.toLowerCase()) assetsUsd = assetsInTokens * usdsPrice

        const yieldUsd = assetsUsd * appreciationRate
        if (yieldUsd > 0) totalYieldUsd += yieldUsd
      } catch {}
    }
  }

  return totalYieldUsd
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const ethPriceRaw = await options.api.call({ abi: 'function latestAnswer() view returns (int256)', target: ETH_USD_FEED })
  const ethPrice = Number(ethPriceRaw) / 1e8

  let usdsPrice = 1.0
  try {
    const res = await axios.get(`https://coins.llama.fi/prices/historical/${options.endTimestamp}/base:${TOKENS.USDS}`)
    usdsPrice = res.data?.coins?.[`base:${TOKENS.USDS}`]?.price || 1.0
  } catch {}

  for (const pool of POOLS) {
    const logs = await sdk.getEventLogs({
      chain: options.chain,
      target: POOL_MANAGER,
      fromBlock: Number(options.fromApi.block),
      toBlock: Number(options.toApi.block),
      topics: [SWAP_TOPIC, pool.id],
      entireLog: true,
    })

    for (const log of logs) {
      const data = log.data.slice(2)
      const amount0 = decodeInt128('0x' + data.slice(32, 64))
      const fee = Number(BigInt('0x' + data.slice(320, 384)))
      const absAmount0 = amount0 > 0n ? amount0 : -amount0

      dailyVolume.add(pool.token, absAmount0)
      dailyFees.add(pool.token, (absAmount0 * BigInt(fee)) / 1000000n)
    }
  }

  const lendingYieldUsd = await calculateLendingYield(options.fromApi, options.toApi, ethPrice, usdsPrice)
  if (lendingYieldUsd > 0) {
    dailyFees.add(TOKENS.USDC, Math.floor(lendingYieldUsd * 1e6))
  }

  // Protocol takes 30% of lending yield as revenue
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Swap fees go entirely to supply side (LPs)
  dailySupplySideRevenue.addBalances(dailyFees)

  // For lending yield: 30% protocol, 70% supply side (net of protocol cut)
  if (lendingYieldUsd > 0) {
    const protocolCutUsd = Math.floor(lendingYieldUsd * 0.3 * 1e6)
    const supplySideCutUsd = Math.floor(lendingYieldUsd * 0.3 * 1e6)
    dailyProtocolRevenue.add(TOKENS.USDC, protocolCutUsd)
    // Subtract the protocol's 30% from supply side (it was already added via dailyFees)
    dailySupplySideRevenue.add(TOKENS.USDC, -supplySideCutUsd)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-09',
    },
  },
}

export default adapter;
