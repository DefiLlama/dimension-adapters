import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0'

const REPRICING_ORACLE = '0xd5a73c748449a45cc7d9f21c7ed3ab9eb3d2e959'
const REWARDS_CALCULATED_EVENT = 'event RewardsCalculatedV3(uint256 indexed blockAtSnapshot, uint256 blockOfLastSnapshot, int256 reserveAssetsChange, uint256 ethDepositsChange, uint256 rewardsPayableForFees, uint256 ethExitedChange, int256 totalSlashedEigenLayerChange, uint256 totalSlashedBurnedEigenLayerChange, int256 totalDualSlashedEigenLayerChange)'

// From 2026-10-21 23:35 UTC the repricing bot raised the rswETH rate 1% per reprice with no rewards reported (Swell hack, suspected key compromise),
// so from that day fees come from the rewards the oracle reports, which match the rate-based figure on normal days
const ORACLE_REWARDS_FROM = Date.UTC(2026, 9, 21) / 1000

async function getRateBasedRewards(options: FetchOptions): Promise<number> {
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
  return Number(totalSupply) * (exchangeRateAfter - exchangeRateBefore) / 0.9 / 1e18
}

async function getOracleRewards(options: FetchOptions): Promise<number> {
  const logs = await options.getLogs({ target: REPRICING_ORACLE, eventAbi: REWARDS_CALCULATED_EVENT })
  return Number(logs.reduce((sum: bigint, log: any) => sum + BigInt(log.rewardsPayableForFees), 0n))
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const df = options.endTimestamp > ORACLE_REWARDS_FROM ? await getOracleRewards(options) : await getRateBasedRewards(options)

  const swellTreasuryRewards = df * 0.05
  const supplySideRewards = df - swellTreasuryRewards
  
  dailyFees.addGasToken(df, METRIC.STAKING_REWARDS)
  dailyRevenue.addGasToken(swellTreasuryRewards, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS)

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
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Total validators fees and rewards from staked ETH.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: '5% staking rewards are charged by Swell Protocol Treasury.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: '90% staking rewards are distributed to ETH stakers and 5% to node operators.',
    },
  },
};

export default adapter;