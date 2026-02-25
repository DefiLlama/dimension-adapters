import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";
import { METRIC } from "../helpers/metrics";

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

async function calculateLendingYield(fromApi: any, toApi: any): Promise<{
  ethAmount: number;
  usdcAmount: number;
}> {
  let ethAmount = 0;
  let usdcAmount = 0;
  const oneShare = (10n ** 18n).toString()

  for (const wrapper of WRAPPERS) {
    for (const hook of HOOKS) {
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

      if (wrapper.underlying.toLowerCase() === TOKENS.WETH.toLowerCase()) ethAmount = assetsInTokens * appreciationRate;
      else if (wrapper.underlying.toLowerCase() === TOKENS.USDS.toLowerCase()) usdcAmount = assetsInTokens * appreciationRate;
    }
  }

  return { ethAmount, usdcAmount };
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

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

      dailyFees.add(pool.token, (absAmount0 * BigInt(fee)) / 1000000n, METRIC.SWAP_FEES)
      dailySupplySideRevenue.add(pool.token, (absAmount0 * BigInt(fee)) / 1000000n, METRIC.SWAP_FEES)
    }
  }

  const { ethAmount, usdcAmount } = await calculateLendingYield(options.fromApi, options.toApi)
  dailyFees.add(TOKENS.WETH, ethAmount * 1e18, METRIC.ASSETS_YIELDS)
  dailyFees.add(TOKENS.USDC, usdcAmount * 1e6, METRIC.ASSETS_YIELDS)
  
  // 70% yields to LPs
  dailySupplySideRevenue.add(TOKENS.WETH, ethAmount * 1e18 * 0.7, METRIC.ASSETS_YIELDS)
  dailySupplySideRevenue.add(TOKENS.USDC, usdcAmount * 1e6 * 0.7, METRIC.ASSETS_YIELDS)
  
  // Protocol takes 30% of lending yield as revenue
  dailyProtocolRevenue.add(TOKENS.WETH, ethAmount * 1e18 * 0.7, METRIC.ASSETS_YIELDS)
  dailyProtocolRevenue.add(TOKENS.USDC, usdcAmount * 1e6 * 0.7, METRIC.ASSETS_YIELDS)

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
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-09',
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
