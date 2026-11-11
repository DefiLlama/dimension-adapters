import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import type { FetchOptions } from "../adapters/types"
import { addTokensReceived } from "../helpers/token";
import { getPositionedLogArgs } from "../helpers/logs";
import ADDRESSES from "../helpers/coreAssets.json"

// from LidoLocator 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb
const STETH = ADDRESSES.ethereum.STETH
const LIDO_ORACLE_V1 = '0x442af784A788A5bd6F42A01Ebe9F287a871243fb'
const LIDO_STAKING_ROUTER = '0xFdDf38947aFB03C621C71b06C9C70bce73f12999';
const LIDO_AGENT = '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c'
const BUYBACKS_SAFE = '0xf6F0732c1e9971497342C295141566E6F1A31e96'

// Rewards Share Easy Track registry: the Agent pays Rewards Share partners and, since the 2025-12-24 Curated Module fee change,
// the tier rebates through it (https://research.lido.fi/t/11107/2)
const REWARDS_SHARE_REGISTRY = '0xdc7300622948a7AdaF339783F6991F9cdDD79776'
// the Rewards Share committee multisig is also a recipient; it pays on to others (Simple DVT operators in Aug-Sep 2026, e.g.
// tx 0xe4de93fb77a13ed107ccbfde21e8a631bac24b87a976c72a5f47c607ea03c261), so its top-ups stay in Revenue
const REWARDS_SHARE_COMMITTEE_MULTISIG = '0xe2A682A9722354D825d1BbDF372cC86B2ea82c8C'
// Curated Module operators paid a tier rebate on top of the 3.5% module fee since the 2025-12-24 fee change: each month the
// Agent sends (tier fee - 3.5%) / 3.5% of the operator's previous-month distribution from the NodeOperatorsRegistry
// 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5. Tiers from https://research.lido.fi/t/10876 (to 2026-07-31) and
// https://research.lido.fi/t/11477/16 (Extra Effort, Decentralization and Public Good Operators from 2026-08-01).
// Addresses are the operators' registry reward addresses unless noted.
const TIER_REBATES_START = '2025-12-24' // a payout to these addresses before the fee change would not be a tier rebate
const TIER_REBATE_RECIPIENTS = new Set([
  '0xfeef177E6168F9b7fd59e6C5b6c2d87FF398c6FD', // #2 P2P.org
  '0xf3a866A5b63010a4369b09C8E691C13905cc9843', // #2 P2P.org, rebate address added 2026-07-24
  '0x0aC7E9aF32422ac5968622585822E4D89ef51343', // #3 Chorus One
  '0x77d2CF58aa4da90b3AFCd283646568e4383193BF', // #18 Stakely
  '0x5a8B929EDBf3CE44526465DD2087EC7EFB59A561', // #30 Launchnodes
  '0xE556Da28015c04F35A52B3111B9F4120E908056e', // #31 SenseiNode
  '0x171bc347d63375E96F0D26E9b9B6238A0De0c1EE', // #0 Staking Facilities, rebate address
  '0xfABb21731AE89D09BA995d97ddb1edE21927F542', // #4 stakefish, rebate address
  '0x3D5A107F7a5bcEC8734c49ed54d41bc6F93eB97F', // #7 Everstake
  '0x765c6a8f20c842E8C826B0D9425015784F982aFc', // #22 RockLogic GmbH
  '0x5Bc5ec5130f66f13d5C21ac6811A7e624ED3C7c6', // #21 Consensys
  '0x36201ed66DbC284132046ee8d99272F8eEeb24c8', // #25 Twinstake
  '0xf82B1FdCD493B2dEFAB52c740399fF150bAA7a2A', // #26 ChainSafe
  '0x3bF3A9260fE18A1239767aC6F0F0bc7c1E5d1cBC', // #27 Prysm Team at Offchain Labs
  '0x07FE5F404778C27f4d3A0AB56dC59f8eFDd32d96', // #28 Sigma Prime
  '0xcd51df5142156BD92E7A9494Dd2b9362f5078D64', // #29 Attestant (BVI) Limited
  '0x0a6a0b60fFeF196113b3530781df6e747DdC565e', // #33 Develp GmbH
].map((address) => address.toLowerCase()))

const LIDO_V2_FIRST_REPORT = '2023-05-16' // block 17272708; the 2023-05-15 report was still V1

const ETH_DISTRIBUTED_EVENT = 'event ETHDistributed(uint256 indexed reportTimestamp, uint256 preCLBalance, uint256 postCLBalance, uint256 withdrawalsWithdrawn, uint256 executionLayerRewardsWithdrawn, uint256 postBufferedEther)'
const TOKEN_REBASED_EVENT = 'event TokenRebased(uint256 indexed reportTimestamp, uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees)'
const POST_TOTAL_SHARES_EVENT = 'event PostTotalShares(uint256 postTotalPooledEther, uint256 preTotalPooledEther, uint256 timeElapsed, uint256 totalShares)'
const EL_REWARDS_RECEIVED_EVENT = 'event ELRewardsReceived(uint256 amount)'
const STAKING_ROUTER_FEE_DISTRIBUTION_ABI = 'function getStakingFeeAggregateDistributionE4Precision() view returns (uint16 modulesFee, uint16 treasuryFee)';
const VAULT_TRANSFER_EVENT = 'event VaultTransfer(address indexed token, address indexed to, uint256 amount)'
const SPENDABLE_AMOUNT_CHANGED_EVENT = 'event SpendableAmountChanged(uint256 _alreadySpentAmount, uint256 _spendableBalance, uint256 indexed _periodStartTimestamp, uint256 _periodEndTimestamp)'
const GET_ALLOWED_RECIPIENTS_ABI = 'function getAllowedRecipients() view returns (address[])'

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

// Payouts through the Rewards Share registry, booked on payment day: the registry emits SpendableAmountChanged only from
// updateSpentAmount, which every Easy Track top-up through it calls (lidofinance/easy-track LimitsChecker.sol). In those
// txs only the Agent's stETH transfers to recipients the registry allows are the top-up, so a payment from another motion
// enacted in the same tx is not counted. Every top-up so far paid stETH only. The token check matters because a recipient
// can sit on other Easy Track registries too: 0x6DC9657C2D90D57cADfFB64239242d06e6103E43 is also on one that paid it DAI
async function getRewardsSharePayouts(options: FetchOptions) {
  const rewardsShare = options.createBalances()
  const tierRebates = options.createBalances()
  const topUps = await options.getLogs({ target: REWARDS_SHARE_REGISTRY, eventAbi: SPENDABLE_AMOUNT_CHANGED_EVENT, onlyArgs: false })
  // most days have no top-up, so the Agent's logs are only read when there is one
  if (!topUps.length) return { rewardsShare, tierRebates }

  // recipients allowed just before the top-up's block: Easy Track checks them when the motion is created and enacted.
  // Read once per block, since top-ups in the same block see the same list
  const allowedByBlock: Record<number, Set<string>> = {}
  const allowedByTx: Record<string, Set<string>> = {}
  for (const log of topUps) {
    const block = Number(log.blockNumber)
    if (!Number.isFinite(block)) throw new Error(`Lido: Rewards Share top-up ${log.transactionHash} has no block number`)
    if (!allowedByBlock[block]) {
      const registryApi = new sdk.ChainApi({ chain: options.chain, block: block - 1 })
      const allowed: string[] = await registryApi.call({ target: REWARDS_SHARE_REGISTRY, abi: GET_ALLOWED_RECIPIENTS_ABI })
      allowedByBlock[block] = new Set(allowed.map((address) => address.toLowerCase()))
    }
    allowedByTx[log.transactionHash.toLowerCase()] = allowedByBlock[block]
  }

  const transfers = await options.getLogs({ target: LIDO_AGENT, eventAbi: VAULT_TRANSFER_EVENT, onlyArgs: false })
  const rebatesStarted = options.dateString >= TIER_REBATES_START
  for (const log of transfers) {
    const to = log.args.to.toLowerCase()
    if (log.args.token.toLowerCase() !== STETH.toLowerCase()) continue
    if (!allowedByTx[log.transactionHash.toLowerCase()]?.has(to)) continue
    if (to === REWARDS_SHARE_COMMITTEE_MULTISIG.toLowerCase()) continue
    const payouts = rebatesStarted && TIER_REBATE_RECIPIENTS.has(to) ? tierRebates : rewardsShare
    payouts.add(log.args.token, log.args.amount)
  }
  return { rewardsShare, tierRebates }
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

  // the DAO pays these out of its treasury share, so they move from Revenue to SupplySideRevenue
  const { rewardsShare, tierRebates } = await getRewardsSharePayouts(options)
  dailySupplySideRevenue.addBalances(rewardsShare, 'Rewards Share payouts to partners')
  dailySupplySideRevenue.addBalances(tierRebates, 'Tier rebates to Curated Module operators')
  dailyRevenue.subtract(rewardsShare, METRIC.STAKING_REWARDS)
  dailyRevenue.subtract(tierRebates, METRIC.STAKING_REWARDS)

  const buybacks = await addTokensReceived({
    options,
    target: LIDO_AGENT,
    fromAdddesses: [BUYBACKS_SAFE],
    tokens: [ADDRESSES.ethereum.LIDO]
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
  version: 2,
  pullHourly: false, // one oracle report per day, hourly windows throw
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2020-12-19',
  allowNegativeValue: true, // revenue nets out Rewards Share and tier-rebate batches on their payment day; protocol revenue also nets out lumpy LDO buybacks
  methodology: {
    Fees: "Staking rewards earned by all ETH staked with Lido: consensus-layer validator rewards plus execution-layer rewards (priority fees and MEV), as booked by each daily oracle report.",
    UserFees: "Lido takes no fees from users.",
    Revenue: "Lido takes a 10% fee on staking rewards; Revenue is only the DAO-treasury portion of that fee (net of the node-operator share, which is a cost of production booked as SupplySideRevenue). From Lido V2 (first report 2023-05-16) the treasury/operator split is the validator-share-weighted aggregate read from the StakingRouter at the oracle report's block; before V2 the split was a fixed 5%/5%, so half the fee is treasury. Rewards Share payouts to partners and Curated Module tier rebates, which the DAO pays out of its share through the Rewards Share Easy Track, are deducted on the day they are paid.",
    HoldersRevenue: "Tracks LIDO bought back by the DAO as part of the LDO Accumulation Program",
    ProtocolRevenue: "DAO-treasury portion of the 10% fee, minus the Rewards Share payouts and Curated Module tier rebates paid from it and the LDO bought back under the LDO Accumulation Program; excludes the node-operator share.",
    SupplySideRevenue: "Staking rewards earned by stETH holders, the node-operator share of the 10% fee (paid to operators for running validators), and the Rewards Share payouts and Curated Module tier rebates the DAO pays out of its share."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators (consensus-layer balance change plus withdrawals, net of principal), as booked by each oracle report.',
      [METRIC.MEV_REWARDS]: 'Execution-layer rewards (priority fees and MEV tips paid by block builders) withdrawn from the Lido Execution Layer Rewards Vault at each oracle report.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'DAO treasury share of staking rewards. From Lido V2 (first report 2023-05-16) the ratio is read from StakingRouter.getStakingFeeAggregateDistributionE4Precision() at the oracle report block — treasuryFee / (modulesFee + treasuryFee); before V2 it is the fixed 5%/5% split (treasury share 0.5). Net of the Rewards Share payouts and tier rebates paid that day (see SupplySideRevenue), so negative on some payout days.',
      [METRIC.MEV_REWARDS]: 'DAO treasury share of MEV rewards.',
    },
    ProtocolRevenue: {
      'DAO treasury share': 'DAO treasury share of the 10% fee on staking and MEV rewards, minus Rewards Share payouts and tier rebates and minus LDO bought back under the LDO Accumulation Program (negative on some payout and buyback days).',
    },
    SupplySideRevenue: {
      'Staking rewards to ETH stakers': 'Share of ETH rewards from running Beacon chain validators to stakers.',
      'MEV rewards to ETH stakers': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
      'Staking rewards to node operators': 'Share of ETH rewards from running Beacon chain validators to node operators.',
      'MEV rewards to node operators': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to node operators.',
      'Rewards Share payouts to partners': 'stETH the DAO pays Rewards Share partners whose referral code or router brings stake (up to 50% of the DAO share of rewards on that stake, https://research.lido.fi/t/11107/2), on the day of each Easy Track top-up through the Rewards Share registry. May include stVaults Rewards Share, which the chain does not mark.',
      'Tier rebates to Curated Module operators': 'stETH the DAO pays Extra Effort, Decentralization and Public Good (client-team) Curated Module operators on top of the 3.5% module fee since the 2025-12-24 fee change, on the day it is paid.',
    },
    HoldersRevenue: {
      'LDO Accumulation Program': 'Tracks LIDO bought back by the DAO.'
    }
  }
}

export default adapter;
