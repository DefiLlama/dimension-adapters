import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// https://docs.swellnetwork.io/swell-staking/sweth-liquid-staking/sweth-v1.0-system-design/rewards-and-distribution/liquid-staking-rewards-and-fees

const swETH = '0xf951E335afb289353dc249e82926178EaC7DEd78'
const SWELL = '0x0a6e7ba5042b38349e437ec6db6214aec7b35676'
const DEAD = '0x000000000000000000000000000000000000dEaD'

const PROGRAMMATIC_BURN_WALLETS = [
  '0xbc4499e1c9a28b0ac6fc38d6245ddd8a8de07efe',
  '0x2019fe73c426e74fed2a140d7e5b577117a6dc1a',
  '0x7815ba83da2e47b3d4386586216e2b1d57c36a6d',
]

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const totalBurns = options.createBalances()
  const programmaticBurns = options.createBalances()

  const exchangeRateBefore = await options.fromApi.call({
    target: swETH,
    abi: 'uint256:getRate',
  })
  const exchangeRateAfter = await options.toApi.call({
    target: swETH,
    abi: 'uint256:getRate',
  })
  const totalSupply = await options.fromApi.call({
    target: swETH,
    abi: 'uint256:totalSupply',
  })

  const totalDeposited = BigInt(totalSupply) * BigInt(exchangeRateBefore) / BigInt(1e18)

  // swell distribute 90% rewards to stakers post protocol revenue and node operators cut
  // 90% to stakers, 5% to node operators, 5% to Swell treasury
  const df = Number(totalDeposited) * (exchangeRateAfter - exchangeRateBefore) / 0.9 / 1e18

  const swellTreasuryRewards = df * 0.05
  const nodeOperatorsRewards = df * 0.05
  const stakersRewards = df - swellTreasuryRewards - nodeOperatorsRewards

  dailyFees.addGasToken(df, METRIC.STAKING_REWARDS)
  dailyRevenue.addGasToken(swellTreasuryRewards, 'Staking rewards to swell')
  dailySupplySideRevenue.addGasToken(stakersRewards, 'Staking rewards to stakers')
  dailySupplySideRevenue.addGasToken(nodeOperatorsRewards, 'Staking rewards to node operators')

  // ALL SWELL burned to dead address
  await addTokensReceived({
    balances: totalBurns,
    tokens: [SWELL],
    targets: [DEAD],
    options,
  })

  //programmatic burns
  await addTokensReceived({
    balances: programmaticBurns,
    tokens: [SWELL],
    targets: [DEAD],
    fromAdddesses: PROGRAMMATIC_BURN_WALLETS,
    options,
  })

  // holders revenue = buyback burns only
  dailyHoldersRevenue.add(totalBurns, METRIC.TOKEN_BUY_BACK)
  dailyHoldersRevenue.subtract(programmaticBurns, METRIC.TOKEN_BUY_BACK)

  const stakingRevenueToProtocol = await dailyRevenue.clone();
  stakingRevenueToProtocol.subtract(dailyHoldersRevenue)

  const stakingRevenueRetained = await stakingRevenueToProtocol.getUSDValue();
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(stakingRevenueRetained, 'Staking rewards retained by protocol')

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'Total staking rewards and fees paid by protocol.',
  Revenue: '5% staking rewards are charged by swell protocol.',
  SupplySideRevenue: '90% staking rewards are distributed to ETH stakers and 5% to node operators.',
  ProtocolRevenue: 'Revenue retained by protocol after buybacks and burns.',
  HoldersRevenue: 'Executed SWELL buybacks tracked as SWELL transferred to the burn address excluding programmatic burns.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Total staking rewards and fees paid by protocol.',
  },
  Revenue: {
    'Staking rewards to swell': '5% staking rewards are charged by swell protocol.',
  },
  SupplySideRevenue: {
    'Staking rewards to stakers': '90% staking rewards are distributed to ETH stakers.',
    'Staking rewards to node operators': '5% staking rewards are distributed to node operators.',
  },
  ProtocolRevenue: {
    'Staking rewards retained by protocol': 'Revenue retained by protocol after buybacks and burns.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'Executed SWELL buybacks tracked as SWELL transferred to the burn address excluding programmatic burns.',
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-14',
    },
  },
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
