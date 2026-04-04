import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'

type ChainConfig = {
  poolManager: string
  pools: { id: string; token: string }[]
  hooks: string[]
  wrappers: { address: string; underlying: string }[]
}

const config: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    pools: [
      // AlphixLVRFee hook (0x7cBbfF9C4fcd74B221C535F4fB4B1Db04F1B9044) — pure swap fee, no lending
      { id: '0xebb666a5c6449b83536950b975d74deb32aca1537a501b58161a896816b04da6', token: '0x4200000000000000000000000000000000000006' }, // ETH/USDC
      { id: '0x3860784278e9e481ffd0888430ab2af8f2bb1180069f31cde9e1066728bbe73b', token: '0x4200000000000000000000000000000000000006' }, // ETH/cbBTC
      // Alphix rehypothecation hooks
      { id: '0xaf9168a5026bd5e398863dc1d0a0513fe21417792f9df4889571fd68d2d8cd71', token: '0x820c137fa70c8691f0e44dc420a5e53c168921dc' }, // USDS/USDC
    ],
    hooks: [
      '0x0e4b892df7c5bcf5010faf4aa106074e555660c0',
    ],
    wrappers: [
      { address: '0xf62bca61Fe33f166791c3c6989b0929CCaaDA5B2', underlying: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' }, // USDC
      { address: '0x59f5245129faBEde6FC4243518B74b1DF78A2D9E', underlying: '0x4200000000000000000000000000000000000006' }, // WETH
      { address: '0xc7b9A2146E9c7F081C84D20626641fc59F3d4cab', underlying: '0x820c137fa70c8691f0e44dc420a5e53c168921dc' }, // USDS
    ],
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    pools: [
      { id: '0xe2c28a234aadc40f115dcc56b70a759d02a372db90dfeed19048392d942ee286', token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' }, // USDC
    ],
    hooks: [
      '0x5e645c3d580976ca9e3fe77525d954e73a0ce0c0',
    ],
    wrappers: [
      { address: '0x968eD10776AC144308ae4160E2F5017A6999126C', underlying: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' }, // USDC
      { address: '0x7d1613B33e0d0E5c5707287b148CAdb3590e702a', underlying: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' }, // USDT
    ],
  },
}

function decodeInt128(hex: string): bigint {
  const val = BigInt(hex)
  return val >= (1n << 127n) ? val - (1n << 128n) : val
}

async function calculateLendingYield(fromApi: any, toApi: any, chainCfg: ChainConfig): Promise<Record<string, number>> {
  const yieldByToken: Record<string, number> = {}
  const oneShare = (10n ** 18n).toString()

  for (const wrapper of chainCfg.wrappers) {
    for (const hook of chainCfg.hooks) {
      const sharesEnd = await toApi.call({ abi: 'erc20:balanceOf', target: wrapper.address, params: [hook] })
      if (BigInt(sharesEnd) === 0n) continue

      const [priceStart, priceEnd] = await Promise.all([
        fromApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [oneShare] }),
        toApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [oneShare] }),
      ])

      if (Number(priceStart) === 0) continue
      const appreciationRate = (Number(priceEnd) - Number(priceStart)) / Number(priceStart)
      if (appreciationRate <= 0) continue

      const assetsEnd = await toApi.call({ abi: 'function convertToAssets(uint256 shares) view returns (uint256)', target: wrapper.address, params: [sharesEnd] })
      const decimals = await toApi.call({ abi: 'function decimals() view returns (uint8)', target: wrapper.address })
      const assetsInTokens = Number(assetsEnd) / (10 ** Number(decimals))
      const yieldTokens = assetsInTokens * appreciationRate

      const token = wrapper.underlying
      yieldByToken[token] = (yieldByToken[token] || 0) + yieldTokens
    }
  }

  return yieldByToken
}

async function fetch(options: FetchOptions) {
  const chainCfg = config[options.chain]
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  // 1. Swap fees from pools
  for (const pool of chainCfg.pools) {
    const logs = await sdk.getEventLogs({
      chain: options.chain,
      target: chainCfg.poolManager,
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
      const feeAmount = (absAmount0 * BigInt(fee)) / 1000000n

      dailyFees.add(pool.token, feeAmount, METRIC.SWAP_FEES)
      dailySupplySideRevenue.add(pool.token, feeAmount, METRIC.SWAP_FEES)
    }
  }

  // 2. Lending yields (computed once — wrappers are shared across pools)
  const yieldByToken = await calculateLendingYield(options.fromApi, options.toApi, chainCfg)

  for (const [token, yieldTokens] of Object.entries(yieldByToken)) {
    if (yieldTokens <= 0) continue
    const decimals = await options.toApi.call({ abi: 'function decimals() view returns (uint8)', target: token })
    const rawAmount = Math.floor(yieldTokens * (10 ** Number(decimals)))

    dailyFees.add(token, rawAmount, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(token, Math.floor(rawAmount * 0.7), METRIC.ASSETS_YIELDS)
    dailyProtocolRevenue.add(token, Math.floor(rawAmount * 0.3), METRIC.ASSETS_YIELDS)
  }

  return {
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
      start: '2026-02-10',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2026-03-07',
    },
  },
  methodology: {
    Fees: 'Total swap fees from Uniswap pools + yields from deployed lending strategies.',
    SupplySideRevenue: 'All swap fees from Uniswap pools + 70% yields from deployed lending strategies.',
    Revenue: 'Share of 30% yields from deployed lending strategies to Alphix.',
    ProtocolRevenue: 'Share of 30% yields from deployed lending strategies to Alphix.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total swap fees from Uniswap pools.',
      [METRIC.ASSETS_YIELDS]: 'Total yields from deployed lending strategies.',
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: 'All swap fees from Uniswap pools.',
      [METRIC.ASSETS_YIELDS]: 'Share of 70% yields from deployed lending strategies.',
    },
    Revenue: {
      [METRIC.ASSETS_YIELDS]: 'Share of 30% yields from deployed lending strategies to Alphix.',
    },
    ProtocolRevenue: {
      [METRIC.ASSETS_YIELDS]: 'Share of 30% yields from deployed lending strategies to Alphix.',
    },
  },
}

export default adapter;
