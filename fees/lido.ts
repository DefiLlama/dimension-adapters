import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import type { FetchOptions } from "../adapters/types"
import { addTokensReceived } from "../helpers/token";
import { getPositionedLogArgs } from "../helpers/logs";
import coreAssets from "../helpers/coreAssets.json"

// from LidoLocator 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
const LIDO_ORACLE_V1 = '0x442af784A788A5bd6F42A01Ebe9F287a871243fb'
const LIDO_STAKING_ROUTER = '0xFdDf38947aFB03C621C71b06C9C70bce73f12999';
const LIDO_AGENT = '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c'
const BUYBACKS_SAFE = '0xf6F0732c1e9971497342C295141566E6F1A31e96'

const LIDO_V2_FIRST_REPORT = '2023-05-16' // block 17272708; the 2023-05-15 report was still V1

const ETH_DISTRIBUTED_EVENT = 'event ETHDistributed(uint256 indexed reportTimestamp, uint256 preCLBalance, uint256 postCLBalance, uint256 withdrawalsWithdrawn, uint256 executionLayerRewardsWithdrawn, uint256 postBufferedEther)'
const TOKEN_REBASED_EVENT = 'event TokenRebased(uint256 indexed reportTimestamp, uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees)'
const POST_TOTAL_SHARES_EVENT = 'event PostTotalShares(uint256 postTotalPooledEther, uint256 preTotalPooledEther, uint256 timeElapsed, uint256 totalShares)'
const EL_REWARDS_RECEIVED_EVENT = 'event ELRewardsReceived(uint256 amount)'
const STAKING_ROUTER_FEE_DISTRIBUTION_ABI = 'function getStakingFeeAggregateDistributionE4Precision() view returns (uint16 modulesFee, uint16 treasuryFee)';

type OracleReport = {
  clRewards: bigint
  elRewards: bigint
  fee: bigint
  treasuryFeeBp: bigint
  totalFeeBp: bigint
}

// V1 fee: 10% of rewards, split 5% node operators / 5% DAO (getFee, getFeeDistribution)
async function getV1Reports(options: FetchOptions): Promise<OracleReport[]> {
  const [totals, elLogs] = await Promise.all([
    options.getLogs({ target: LIDO_ORACLE_V1, eventAbi: POST_TOTAL_SHARES_EVENT }),
    options.getLogs({ target: STETH, eventAbi: EL_REWARDS_RECEIVED_EVENT }),
  ])
  const rewards = totals.reduce((acc: bigint, log: any) => acc + BigInt(log.postTotalPooledEther) - BigInt(log.preTotalPooledEther), 0n)
  const elRewards = elLogs.reduce((acc: bigint, log: any) => acc + BigInt(log.amount), 0n)
  return [{ clRewards: rewards - elRewards, elRewards, fee: rewards > 0n ? rewards / 10n : 0n, treasuryFeeBp: 5000n, totalFeeBp: 10000n }]
}

// EL rewards come from the report, not vault txs: most reach the vault as coinbase credits
async function getV2Reports(options: FetchOptions): Promise<OracleReport[]> {
  const [distributed, rebased] = await Promise.all([
    getPositionedLogArgs(options, { target: STETH, eventAbi: ETH_DISTRIBUTED_EVENT }),
    options.getLogs({ target: STETH, eventAbi: TOKEN_REBASED_EVENT }),
  ])
  // one report every day since V2, so none means missing logs
  if (!distributed.length) throw new Error(`Lido: no oracle report found for ${options.dateString}`)

  return Promise.all(distributed.map(async (report) => {
    const rebase = rebased.find((log: any) => String(log.reportTimestamp) === String(report.reportTimestamp))
    if (!rebase) throw new Error(`Lido: no TokenRebased for report ${report.reportTimestamp} on ${options.dateString}`)

    // at the report block: the 2025-12-24 fee change landed after that day's report
    const reportApi = new sdk.ChainApi({ chain: options.chain, block: report.blockNumber })
    const feeSplit = await reportApi.call({ target: LIDO_STAKING_ROUTER, abi: STAKING_ROUTER_FEE_DISTRIBUTION_ABI })
    const treasuryFeeBp = BigInt(feeSplit.treasuryFee)
    const totalFeeBp = BigInt(feeSplit.modulesFee) + treasuryFeeBp
    if (totalFeeBp === 0n) throw new Error(`Lido: StakingRouter returned a zero fee split for ${options.dateString}; refusing to guess the treasury/operator ratio`)

    return {
      clRewards: BigInt(report.postCLBalance) + BigInt(report.withdrawalsWithdrawn) - BigInt(report.preCLBalance),
      elRewards: BigInt(report.executionLayerRewardsWithdrawn),
      fee: BigInt(rebase.sharesMintedAsFees) * BigInt(rebase.postTotalEther) / BigInt(rebase.postTotalShares),
      treasuryFeeBp,
      totalFeeBp,
    }
  }))
}

const fetch = async (options: FetchOptions) => {
  const reports = options.dateString < LIDO_V2_FIRST_REPORT ? await getV1Reports(options) : await getV2Reports(options)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  for (const { clRewards, elRewards, fee, treasuryFeeBp, totalFeeBp } of reports) {
    // fee split pro rata across CL/EL, then treasury vs node operators
    const totalRewards = clRewards + elRewards
    const clFee = totalRewards > 0n ? fee * clRewards / totalRewards : 0n
    const elFee = fee - clFee
    const clTreasuryFee = clFee * treasuryFeeBp / totalFeeBp
    const elTreasuryFee = elFee * treasuryFeeBp / totalFeeBp

    dailyFees.addGasToken(clRewards, METRIC.STAKING_REWARDS)
    dailyFees.addGasToken(elRewards, METRIC.MEV_REWARDS)

    dailySupplySideRevenue.addGasToken(clRewards - clFee, 'Staking rewards to ETH stakers')
    dailySupplySideRevenue.addGasToken(elRewards - elFee, 'MEV rewards to ETH stakers')
    dailySupplySideRevenue.addGasToken(clFee - clTreasuryFee, 'Staking rewards to node operators')
    dailySupplySideRevenue.addGasToken(elFee - elTreasuryFee, 'MEV rewards to node operators')

    dailyRevenue.addGasToken(clTreasuryFee, METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(elTreasuryFee, METRIC.MEV_REWARDS)
  }

  const buybacks = await addTokensReceived({
    options,
    target: LIDO_AGENT,
    fromAdddesses: [BUYBACKS_SAFE],
    tokens: [coreAssets.ethereum.LIDO]
  })
  dailyHoldersRevenue.addBalances(buybacks, "LDO Accumulation Program")

  // buybacks are paid from the treasury share
  const dailyProtocolRevenue = options.createBalances()
  dailyProtocolRevenue.addBalances(dailyRevenue, 'DAO treasury share')
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, 'DAO treasury share')

  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2020-12-19',
  allowNegativeValue: true, // protocol revenue nets out lumpy LDO buybacks
  methodology: {
    Fees: "Staking rewards earned by all ETH staked with Lido: consensus-layer validator rewards plus execution-layer rewards (priority fees and MEV), as booked by each daily oracle report.",
    UserFees: "Lido takes no fees from users.",
    Revenue: "Lido takes a 10% fee on staking rewards; Revenue is only the DAO-treasury portion of that fee (net of the node-operator share, which is a cost of production booked as SupplySideRevenue). From Lido V2 (first report 2023-05-16) the treasury/operator split is the validator-share-weighted aggregate read from the StakingRouter at the oracle report's block; before V2 the split was a fixed 5%/5%, so half the fee is treasury.",
    HoldersRevenue: "Tracks LIDO bought back by the DAO as part of the LDO Accumulation Program",
    ProtocolRevenue: "DAO-treasury portion of the 10% fee, minus the LDO bought back under the LDO Accumulation Program; excludes the node-operator share.",
    SupplySideRevenue: "Staking rewards earned by stETH holders plus the node-operator share of the 10% fee (paid to operators for running validators)."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators (consensus-layer balance change plus withdrawals, net of principal), as booked by each oracle report.',
      [METRIC.MEV_REWARDS]: 'Execution-layer rewards (priority fees and MEV tips paid by block builders) withdrawn from the Lido Execution Layer Rewards Vault at each oracle report.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'DAO treasury share of staking rewards. From Lido V2 (first report 2023-05-16) the ratio is read from StakingRouter.getStakingFeeAggregateDistributionE4Precision() at the oracle report block — treasuryFee / (modulesFee + treasuryFee); before V2 it is the fixed 5%/5% split (treasury share 0.5).',
      [METRIC.MEV_REWARDS]: 'DAO treasury share of MEV rewards.',
    },
    ProtocolRevenue: {
      'DAO treasury share': 'DAO treasury share of the 10% fee on staking and MEV rewards, minus LDO bought back under the LDO Accumulation Program (negative on buyback days).',
    },
    SupplySideRevenue: {
      'Staking rewards to ETH stakers': 'Share of ETH rewards from running Beacon chain validators to stakers.',
      'MEV rewards to ETH stakers': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
      'Staking rewards to node operators': 'Share of ETH rewards from running Beacon chain validators to node operators.',
      'MEV rewards to node operators': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to node operators.',
    },
    HoldersRevenue: {
      'LDO Accumulation Program': 'Tracks LIDO bought back by the DAO.'
    }
  }
}

export default adapter;
