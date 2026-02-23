import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const exchangeRateBefore = await options.fromApi.call({
    target: rswETH,
    abi: 'uint256:getRate',
  })
  const exchangeRateAfter = await options.toApi.call({
    target: rswETH,
    abi: 'uint256:getRate',
  })
  const totalSupply = await options.fromApi.call({
    target: rswETH,
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

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-28',
    },
  },
  methodology: {
    Fees: 'Total validators fees and rewards from staked ETH.',
    Revenue: '5% staking rewards are charged by Swell Protocol Treasury.',
    SupplySideRevenue: '90% staking rewards are distributed to ETH stakers and 5% to node operators.',
    ProtocolRevenue: '5% staking rewards are charged by Swell Protocol Treasury.',
    HoldersRevenue: 'No revenue share to SWELL token holders.',
  },
};

export default adapter;