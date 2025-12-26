import { Adapter, FetchOptions, FetchResultV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'

interface config {
  token: string
  start: string
}

/**
 * Performance Fee: Finality Providers take 8% commission on all staking rewards
 * Fixed Network Security Fee: using getRedeemFee
 * https://docs.lombard.finance/lbtc-liquid-bitcoin/lbtc-yield-bearing-btc/fees
 */
const PERFORMANCE_FEE_RATE = 0.08 // 8%
const SUPPLY_SIDE_RATE = 1 - PERFORMANCE_FEE_RATE // 92%

const chainConfig: Record<string, config> = {
  [CHAIN.ETHEREUM]: {
    token: '0x8236a87084f8B84306f72007F36F2618A5634494',
    start: '2024-05-18',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const config = chainConfig[options.chain]

  // Fetch all UnstakeRequest events
  const unstakeLogs = await options.getLogs({
    target: config.token,
    eventAbi: 'event UnstakeRequest(address indexed user, bytes scriptPubkey, uint256 amount)',
  })

  const redeemFee = await options.fromApi.call({
    target: config.token,
    abi: 'uint256:getRedeemFee',
    permitFailure: true
  })
  const fixedRedeemFeeLBTC = redeemFee ? Number(redeemFee) : 10000

  // Apply fixed fee for each unstake
  for (const _ of unstakeLogs) {
    dailyFees.add(config.token, fixedRedeemFeeLBTC, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.add(config.token, fixedRedeemFeeLBTC, METRIC.MINT_REDEEM_FEES)
    dailyProtocolRevenue.add(config.token, fixedRedeemFeeLBTC, METRIC.MINT_REDEEM_FEES)
  }

  const [exchangeRateBefore, exchangeRateAfter, totalSupply] = await Promise.all([
    options.fromApi.call({
      target: config.token,
      abi: 'uint256:getRate',
      permitFailure: true,
    }),
    options.toApi.call({
      target: config.token,
      abi: 'uint256:getRate',
      permitFailure: true,
    }),
    options.fromApi.call({
      target: config.token,
      abi: 'uint256:totalSupply',
      permitFailure: true,
    }),
  ])
  
  if (exchangeRateBefore && exchangeRateAfter && totalSupply) {
    const totalDeposited = (BigInt(totalSupply) * BigInt(exchangeRateBefore)) / BigInt(1e18)
      
    const df = (Number(totalDeposited) * (Number(exchangeRateAfter) - Number(exchangeRateBefore))) / SUPPLY_SIDE_RATE / 1e18
  
    // Split: 92% to supply-side (LBTC holders), 8% to protocol (Finality Providers)
    const performanceFees = df * PERFORMANCE_FEE_RATE
    const supplySideRewards = df * SUPPLY_SIDE_RATE
  
    // staking rewards to suppliers
    dailyFees.add(config.token, supplySideRewards, METRIC.STAKING_REWARDS)
    dailySupplySideRevenue.add(config.token, supplySideRewards, METRIC.STAKING_REWARDS)
  
    // performance fees to protocol
    dailyFees.add(config.token, performanceFees, METRIC.PERFORMANCE_FEES)
    dailyProtocolRevenue.add(config.token, performanceFees, METRIC.PERFORMANCE_FEES)
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees:
      'A fixed LBTC Network Security Fee (0.0001 LBTC) is charged for each BTC withdrawal. Additionally, staking rewards accrue from Bitcoin staking via Babylon protocol, reflected in LBTC exchange rate appreciation.',
    UserFees:
      'Users pay a fixed LBTC Network Security Fee per BTC withdrawal.',
    Revenue:
      'Network Security Fees plus 8% performance fee on staking rewards (Finality Providers commission).',
    ProtocolRevenue:
      'Network Security Fees plus 8% performance fee on staking rewards (Finality Providers commission).',
    SupplySideRevenue:
      '92% of staking rewards are distributed to LBTC holders through exchange rate appreciation. Yield accrues automatically as LBTC grows in BTC terms.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Yield accruing to LBTC holders via exchange rate appreciation from Bitcoin staking via Babylon protocol, minus performance fee.',
      [METRIC.PERFORMANCE_FEES]: 'Performance fee (8%) collected by Finality Providers on staking rewards.',
      [METRIC.MINT_REDEEM_FEES]: 'Fixed Network Security Fee (0.0001 LBTC) charged for each BTC withdrawal/unstaking.',
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: 'Performance fee (8%) collected by Finality Providers on staking rewards.',
      [METRIC.MINT_REDEEM_FEES]: 'Fixed Network Security Fee (0.0001 LBTC) charged for each BTC withdrawal/unstaking.',
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: 'Performance fee (8%) collected by Finality Providers on staking rewards.',
      [METRIC.MINT_REDEEM_FEES]: 'Fixed Network Security Fee (0.0001 LBTC) charged for each BTC withdrawal/unstaking.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Yield accruing to LBTC holders via exchange rate appreciation from Bitcoin staking via Babylon protocol, minus performance fee.',
    },
  },
}

export default adapter
