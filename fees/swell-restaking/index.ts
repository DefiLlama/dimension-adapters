import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0'

const REPRICING_ORACLE = '0xd5a73c748449a45cc7d9f21c7ed3ab9eb3d2e959'
const REWARDS_CALCULATED_EVENT = 'event RewardsCalculatedV3(uint256 indexed blockAtSnapshot, uint256 blockOfLastSnapshot, int256 reserveAssetsChange, uint256 ethDepositsChange, uint256 rewardsPayableForFees, uint256 ethExitedChange, int256 totalSlashedEigenLayerChange, uint256 totalSlashedBurnedEigenLayerChange, int256 totalDualSlashedEigenLayerChange)'

// From 2026-10-21 23:35 UTC the repricing bot raised the rswETH rate 1% per reprice with no rewards reported (Swell hack, suspected key compromise),
// so from that day fees come from the rewards the oracle reports, which match the rate-based figure on normal days
const ORACLE_REWARDS_FROM = Date.UTC(2026, 9, 21) / 1000

async function getRateBasedRewards(options: FetchOptions, feeShare: number): Promise<number> {
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
  // the rate only reflects the stakers' share, so gross it up by the fee taken at reprice
  return Number(totalSupply) * (exchangeRateAfter - exchangeRateBefore) / (1 - feeShare) / 1e18
}

async function getOracleRewards(options: FetchOptions): Promise<number> {
  const logs = await options.getLogs({ target: REPRICING_ORACLE, eventAbi: REWARDS_CALCULATED_EVENT })
  return Number(logs.reduce((sum: bigint, log: any) => sum + BigInt(log.rewardsPayableForFees), 0n))
}

// treasury and node operator fees are set on the rswETH contract (1e18 = 100%): both 0 until block 19329325 (2024-02-28 23:32 UTC), 5% each since
// read at the period start: no reprice has shared an hour with a fee change so far
async function getFeePercentages(options: FetchOptions) {
  const [treasury, nodeOperators] = await options.fromApi.batchCall([
    { target: rswETH, abi: 'uint256:swellTreasuryRewardPercentage' },
    { target: rswETH, abi: 'uint256:nodeOperatorRewardPercentage' },
  ])
  const fees = { treasury: Number(treasury) / 1e18, nodeOperators: Number(nodeOperators) / 1e18 }
  if (fees.treasury + fees.nodeOperators >= 1) throw new Error('swell-restaking: fee percentages add up to 100% or more')
  return fees
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const fees = await getFeePercentages(options)
  const df = options.endTimestamp > ORACLE_REWARDS_FROM ? await getOracleRewards(options) : await getRateBasedRewards(options, fees.treasury + fees.nodeOperators)

  const swellTreasuryRewards = df * fees.treasury
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
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-28',
    },
  },
  methodology: {
    Fees: 'Total validators fees and rewards from staked ETH.',
    Revenue: 'Treasury share of staking rewards, read from the rswETH contract: 0% until 2024-02-28 (block 19329325), 5% since.',
    SupplySideRevenue: 'Staking rewards to ETH stakers and node operators. The node operator share is read from the rswETH contract: 0% until 2024-02-28 (block 19329325), 5% since.',
    ProtocolRevenue: 'Treasury share of staking rewards, read from the rswETH contract: 0% until 2024-02-28 (block 19329325), 5% since.',
    HoldersRevenue: 'No revenue share to SWELL token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Total validators fees and rewards from staked ETH.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Treasury share of staking rewards, read from the rswETH contract: 0% until 2024-02-28 (block 19329325), 5% since.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards to ETH stakers and node operators. The node operator share is read from the rswETH contract: 0% until 2024-02-28 (block 19329325), 5% since.',
    },
  },
};

export default adapter;