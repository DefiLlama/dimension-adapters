import * as sdk from '@defillama/sdk'
import { request, gql } from 'graphql-request'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import ADDRESSES from '../helpers/coreAssets.json'
import AaveAbis from '../helpers/aave/abi'
import { getTimestampAtStartOfDayUTC } from '../utils/date'

/**
 * Morpheus AI
 *
 * Users deposit yield-bearing assets (stETH, wETH, USDC, USDT, wBTC).
 * Protocol captures 100% of yield; users receive MOR token emissions instead.
 *
 * Yield sources: Lido stETH rebasing + Aave V3 interest
 * Yield usage: Protocol-Owned Liquidity, MOR buybacks, burns, Epoch 2 reserves
 */

// Contract addresses
const STETH = ADDRESSES.ethereum.STETH
const WETH = ADDRESSES.ethereum.WETH
const USDC = ADDRESSES.ethereum.USDC
const USDT = ADDRESSES.ethereum.USDT
const WBTC = ADDRESSES.ethereum.WBTC

// L1SenderV2 - handles MOR minting messages to Arbitrum
const L1_SENDER_V2 = '0x2Efd4430489e1a05A89c2F51811aC661B7E5FF84'

// Distributor contract - holds assets and has Aave integration
const DISTRIBUTOR = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A'

const MOR_COINGECKO_ID = 'morpheusai'

const LIDO_SUBGRAPH_ENDPOINT = sdk.graph.modifyEndpoint(
  'F7qb71hWab6SuRL5sf6LQLTpNahmqMsBnnweYHzLGUyG'
)

// Aave ray precision (1e27)
const RAY = BigInt(1e27)

// Aave V3 Pool Data Provider on Ethereum mainnet (global Aave contract for reserve data)
const AAVE_V3_POOL_DATA_PROVIDER = '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3'

// Buyback executor on Arbitrum - receives wstETH from L2TokenReceiver and executes MOR swaps
const BUYBACK_EXECUTOR = '0x151c2b49cdec10b150b2763df3d1c00d70c90956'

const MOR_ARB = '0x092bAaDB7DEf4C3981454dD9c0A0D7FF07bCFc86'

// Deposit pool contracts
const DEPOSIT_POOLS = {
  stETH: {
    address: '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
    token: STETH,
    isAave: false, // stETH uses native rebasing
  },
  wETH: {
    address: '0x9380d72aBbD6e0Cc45095A2Ef8c2CA87d77Cb384',
    token: WETH,
    isAave: true,
  },
  USDC: {
    address: '0x6cCE082851Add4c535352f596662521B4De4750E',
    token: USDC,
    isAave: true,
  },
  USDT: {
    address: '0x3B51989212BEdaB926794D6bf8e9E991218cf116',
    token: USDT,
    isAave: true,
  },
  wBTC: {
    address: '0xdE283F8309Fd1AA46c95d299f6B8310716277A42',
    token: WBTC,
    isAave: true,
  },
}

const MetricLabels = {
  LIDO_STAKING: 'Lido stETH Staking Rewards',
  AAVE_LENDING: 'Aave Borrow Interest',
  MOR_EMISSION: 'MOR Token Emission',
  TOKEN_BUY_BACK: METRIC.TOKEN_BUY_BACK,
}

/**
 * Get stETH yield in USD using Lido subgraph (same method as Lido adapter)
 * Pro-rates Lido's daily supply-side revenue by Morpheus's share of total stETH
 */
const getStethDailyYieldUsd = async (options: FetchOptions, totalSteth: bigint) => {
  if (totalSteth === 0n) return 0

  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400)
  const graphQuery = gql`
    {
      financialsDailySnapshot(id: ${dateId}) {
        dailySupplySideRevenueUSD
      }
    }
  `

  const [graphRes, totalStethSupply] = await Promise.all([
    request(LIDO_SUBGRAPH_ENDPOINT, graphQuery),
    options.fromApi.call({
      target: STETH,
      abi: 'function totalSupply() view returns (uint256)',
    }),
  ])

  const dailySupplySideRevenueUSD = graphRes?.financialsDailySnapshot?.dailySupplySideRevenueUSD
  if (!dailySupplySideRevenueUSD) return 0

  const totalSupply = BigInt(totalStethSupply)
  if (totalSupply === 0n) return 0

  // Pro-rate by Morpheus's share of total stETH (same as Lido adapter pattern)
  const morpheusShareUsd =
    (Number(dailySupplySideRevenueUSD) * Number(totalSteth)) / Number(totalSupply)
  return morpheusShareUsd
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  // Calculate stETH yield using Lido subgraph (same method as Lido adapter)
  const totalStethDeposited = await options.fromApi.call({
    target: DEPOSIT_POOLS.stETH.address,
    abi: 'function totalDepositedInPublicPools() view returns (uint256)',
  })

  const stethYieldUsd = await getStethDailyYieldUsd(options, BigInt(totalStethDeposited))

  if (stethYieldUsd > 0) {
    dailyFees.addUSDValue(stethYieldUsd, MetricLabels.LIDO_STAKING)
    dailyRevenue.addUSDValue(stethYieldUsd, MetricLabels.LIDO_STAKING)
  }

  // Calculate Aave yield for other assets (wETH, USDC, USDT, wBTC)
  const aavePools = Object.entries(DEPOSIT_POOLS).filter(([, pool]) => pool.isAave)
  const aaveTokens = aavePools.map(([, pool]) => pool.token)
  const aavePoolAddresses = aavePools.map(([, pool]) => pool.address)

  const [totalDeposits, reserveDataBeforeList, reserveDataAfterList] = await Promise.all([
    options.fromApi.multiCall({
      abi: 'function totalDepositedInPublicPools() view returns (uint256)',
      calls: aavePoolAddresses,
      permitFailure: true,
    }),
    options.fromApi.multiCall({
      abi: AaveAbis.getReserveDataV3,
      target: AAVE_V3_POOL_DATA_PROVIDER,
      calls: aaveTokens,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: AaveAbis.getReserveDataV3,
      target: AAVE_V3_POOL_DATA_PROVIDER,
      calls: aaveTokens,
      permitFailure: true,
    }),
  ])

  for (let i = 0; i < aavePools.length; i++) {
    const totalDeposited = totalDeposits[i]
    const reserveDataBefore = reserveDataBeforeList[i]
    const reserveDataAfter = reserveDataAfterList[i]
    const token = aaveTokens[i]

    if (
      !totalDeposited ||
      !reserveDataBefore ||
      !reserveDataAfter ||
      BigInt(totalDeposited) === BigInt(0)
    )
      continue

    // Aave interest via liquidity index growth (same method as helpers/aave)
    const liquidityIndexBefore = BigInt(reserveDataBefore.liquidityIndex)
    const liquidityIndexAfter = BigInt(reserveDataAfter.liquidityIndex)
    const growthLiquidityIndex = liquidityIndexAfter - liquidityIndexBefore

    if (growthLiquidityIndex <= 0n) continue

    const dailyYield = (BigInt(totalDeposited) * growthLiquidityIndex) / RAY

    if (dailyYield > 0) {
      dailyFees.add(token, dailyYield, MetricLabels.AAVE_LENDING)
      dailyRevenue.add(token, dailyYield, MetricLabels.AAVE_LENDING)
    }
  }

  // 3. Track MOR emissions to users (supply side)
  // MintMessageSent is emitted when users claim MOR rewards
  const dailySupplySideRevenue = options.createBalances()

  const mintMessageLogs = await options.getLogs({
    target: L1_SENDER_V2,
    eventAbi: 'event MintMessageSent(address user, uint256 amount)',
  })

  for (const log of mintMessageLogs) {
    // Track MOR emissions - convert from wei (18 decimals) to whole tokens
    const morAmount = Number(log.amount) / 1e18
    dailySupplySideRevenue.addCGToken(MOR_COINGECKO_ID, morAmount, MetricLabels.MOR_EMISSION)
    dailyFees.addCGToken(MOR_COINGECKO_ID, morAmount, MetricLabels.MOR_EMISSION)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue, // MOR token emissions to depositors (separate from captured yield)

    // buy back on arbitrum
    dailyHoldersRevenue: 0,
  }
}

const fetchBuybacks = async (options: FetchOptions) => {
  const dailyHoldersRevenue = options.createBalances()

  // Track MOR tokens received by BUYBACK_EXECUTOR via Transfer events
  const transferLogs = await options.getLogs({
    target: MOR_ARB,
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer signature
      null as any,
      '0x000000000000000000000000' + BUYBACK_EXECUTOR.slice(2).toLowerCase(), // to = BUYBACK_EXECUTOR
    ],
  })

  for (const log of transferLogs) {
    const amount = BigInt(log.value)
    if (amount > 0n) {
      dailyHoldersRevenue.add(MOR_ARB, amount, MetricLabels.TOKEN_BUY_BACK)
    }
  }

  return {
    // only buy back
    dailyFees: 0,
    dailyRevenue: 0,
    dailySupplySideRevenue: 0,

    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-02-08',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchBuybacks,
      start: '2024-05-08',
    },
  },
  methodology: {
    Fees: 'Yield captured from deposits: stETH rebasing (Lido) + Aave V3 interest on wETH, USDC, USDT, wBTC.',
    Revenue: 'All captured yield (100%).',
    HoldersRevenue: 'MOR buybacks funded by yield (75%): buy & burn, buy & lock, buy & add to PoL.',
    SupplySideRevenue:
      'MOR token emissions to depositors. (24% of daily supply, ~3,456 MOR/day at launch, declining until 2040)',
  },
  breakdownMethodology: {
    Fees: {
      [MetricLabels.LIDO_STAKING]: 'Yield captured from stETH rebasing (Lido)',
      [MetricLabels.AAVE_LENDING]: 'Yield captured from Aave V3 interest on wETH, USDC, USDT, wBTC',
      [MetricLabels.MOR_EMISSION]:
        'MOR token emissions to depositors. (24% of daily supply, ~3,456 MOR/day at launch, declining until 2040)',
      [MetricLabels.TOKEN_BUY_BACK]:
        'MOR buybacks funded by yield (75%): buy & burn, buy & lock, buy & add to PoL',
    },
    Revenue: {
      [MetricLabels.LIDO_STAKING]: 'Yield captured from stETH rebasing (Lido)',
      [MetricLabels.AAVE_LENDING]: 'Yield captured from Aave V3 interest on wETH, USDC, USDT, wBTC',
    },
    SupplySideRevenue: {
      [MetricLabels.MOR_EMISSION]:
        'MOR token emissions to depositors. (24% of daily supply, ~3,456 MOR/day at launch, declining until 2040)',
    },
    HoldersRevenue: {
      [MetricLabels.TOKEN_BUY_BACK]:
        'MOR buybacks funded by yield (75%): buy & burn, buy & lock, buy & add to PoL.',
    },
  },
}

export default adapter
