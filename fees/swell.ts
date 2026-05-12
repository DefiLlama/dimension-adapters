import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

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
  const supplySideRewards = df - swellTreasuryRewards
  
  dailyFees.addGasToken(df)
  dailyRevenue.addGasToken(swellTreasuryRewards)
  dailySupplySideRevenue.addGasToken(supplySideRewards)

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
  dailyHoldersRevenue.add(totalBurns)
  dailyHoldersRevenue.subtract(programmaticBurns)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-14',
    },
  },
  methodology: {
    Fees: 'Total validators fees and rewards from staked ETH.',
    Revenue: '5% staking rewards are charged by Swell Protocol Treasury.',
    SupplySideRevenue: '90% staking rewards are distributed to ETH stakers and 5% to node operators.',
    ProtocolRevenue: '5% staking rewards are charged by Swell Protocol Treasury.',
    HoldersRevenue: 'Executed SWELL buybacks tracked as SWELL transferred to the burn address excluding programmatic burns.',
  },
  breakdownMethodology: {
    dailyFees: {
      fees: 'Total validator rewards'
    },
    dailyRevenue: {
      protocol_revenue: '5% staking yield taken as protocol revenue'
    },
    dailySupplySideRevenue: {
      supply_side: 'Rewards distributed to stakers and node operators'
    },
    dailyHoldersRevenue: {
      holders_buyback: 'SWELL transferred to the burn address excluding programmatic burns'
    }
  },
};

export default adapter;
