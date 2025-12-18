import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import ADDRESSES from '../helpers/coreAssets.json'
import AaveAbis from '../helpers/aave/abi'

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

// MOR coingecko ID for pricing supply side emissions
const MOR_COINGECKO_ID = 'morpheusai'

// Aave ray precision (1e27 = 100% APY)
const RAY = BigInt(1e27)

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

/**
 * Calculate stETH yield from the TokenRebased event
 * stETH rebases daily when Lido reports validator rewards
 */
const getStethDailyYield = async (options: FetchOptions, totalSteth: bigint) => {
  // Get the TokenRebased event from stETH contract
  const rebaseLogs = await options.getLogs({
    target: STETH,
    eventAbi:
      'event TokenRebased(uint256 indexed reportTimestamp, uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees)',
  })

  if (rebaseLogs.length === 0) {
    return BigInt(0)
  }

  // Use the most recent rebase event
  const lastRebase = rebaseLogs[rebaseLogs.length - 1]

  // Calculate exchange rate change
  const preTotalEther = BigInt(lastRebase.preTotalEther)
  const preTotalShares = BigInt(lastRebase.preTotalShares)
  const postTotalEther = BigInt(lastRebase.postTotalEther)
  const postTotalShares = BigInt(lastRebase.postTotalShares)

  // Exchange rate = totalEther / totalShares
  // We use high precision to avoid rounding errors
  const PRECISION = BigInt(1e18)
  const exchangeRateBefore = (preTotalEther * PRECISION) / preTotalShares
  const exchangeRateAfter = (postTotalEther * PRECISION) / postTotalShares

  // Calculate shares for the total stETH holdings
  const stethShares = (totalSteth * preTotalShares) / preTotalEther

  // Calculate yield: shares × (newRate - oldRate)
  const yieldAmount = (stethShares * (exchangeRateAfter - exchangeRateBefore)) / PRECISION

  return yieldAmount
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  // Calculate stETH yield from rebasing
  const totalStethDeposited = await options.api.call({
    target: DEPOSIT_POOLS.stETH.address,
    abi: 'function totalDepositedInPublicPools() view returns (uint256)',
  })

  const stethYield = await getStethDailyYield(options, BigInt(totalStethDeposited))

  if (stethYield > 0) {
    dailyFees.add(STETH, stethYield, METRIC.STAKING_REWARDS)
    dailyRevenue.add(STETH, stethYield, METRIC.STAKING_REWARDS)
  }

  // Calculate Aave yield for other assets (wETH, USDC, USDT, wBTC)
  const aaveDataProvider = await options.api.call({
    target: DISTRIBUTOR,
    abi: 'function aavePoolDataProvider() view returns (address)',
  })

  const aavePools = Object.entries(DEPOSIT_POOLS).filter(([, pool]) => pool.isAave)
  const aaveTokens = aavePools.map(([, pool]) => pool.token)
  const aavePoolAddresses = aavePools.map(([, pool]) => pool.address)

  const [totalDeposits, reserveDataList] = await Promise.all([
    options.api.multiCall({
      abi: 'function totalDepositedInPublicPools() view returns (uint256)',
      calls: aavePoolAddresses,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: AaveAbis.getReserveDataV3,
      target: aaveDataProvider,
      calls: aaveTokens,
      permitFailure: true,
    }),
  ])

  for (let i = 0; i < aavePools.length; i++) {
    const totalDeposited = totalDeposits[i]
    const reserveData = reserveDataList[i]
    const token = aaveTokens[i]

    if (!totalDeposited || !reserveData || BigInt(totalDeposited) === BigInt(0)) continue

    // liquidityRate is in ray (1e27 = 100% APY)
    const liquidityRate = BigInt(reserveData.liquidityRate)
    // Calculate daily yield: principal × (liquidityRate / RAY / 365)
    const dailyYield = (BigInt(totalDeposited) * liquidityRate) / RAY / BigInt(365)

    if (dailyYield > 0) {
      dailyFees.add(token, dailyYield, METRIC.ASSETS_YIELDS)
      dailyRevenue.add(token, dailyYield, METRIC.ASSETS_YIELDS)
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
    dailySupplySideRevenue.addCGToken(MOR_COINGECKO_ID, morAmount)
  }

  return {
    dailyFees,
    dailyUserFees: options.createBalances(), // Users don't pay direct fees - they forgo yield instead
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: options.createBalances(), // MOR token holders don't receive captured yield
    dailySupplySideRevenue, // MOR token emissions to depositors (separate from captured yield)
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-02-08',
    },
  },
  methodology: {
    Fees: 'Yield captured from user deposits: stETH rebasing (Lido) + Aave V3 interest on wETH, USDC, USDT, wBTC. Protocol captures 100% of yield.',
    UserFees: 'Zero. Users forgo yield in exchange for MOR token emissions.',
    Revenue: 'Equal to Fees - 100% of captured yield.',
    ProtocolRevenue:
      'All captured yield. Used for Protocol-Owned Liquidity, MOR buybacks, burns, and Epoch 2 reserves.',
    HoldersRevenue:
      'Zero. Value accrues to MOR holders via buybacks and burns, not direct distributions.',
    SupplySideRevenue:
      'MOR token emissions to depositors (24% of daily supply, ~3,456 MOR/day at launch, declining until 2040).',
  },
}

export default adapter
