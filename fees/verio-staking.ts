import { SimpleAdapter, FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import * as sdk from "@defillama/sdk"
import { METRIC } from "../helpers/metrics"

const REWARD_POOL = '0x3bDcB577C21a36f66816bE3D5d8C311419EC3975'
const VIP_TOKEN = '0x5267f7ee069ceb3d8f1c760c215569b79d0685ad'

const ABIs = {
  getFeeBps: 'function getFeeBps() view returns (uint256)',
  RewardClaimed: 'event RewardClaimed(address indexed to, uint256 amount)',
  Transfer: 'event Transfer(address indexed from, address indexed to, uint256 value)',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const api = new sdk.ChainApi({ chain: options.chain })

  const [feeBps, rewardClaimedLogs, burnLogs] = await Promise.all([
    api.call({ target: REWARD_POOL, abi: ABIs.getFeeBps }),
    options.getLogs({
      target: REWARD_POOL,
      eventAbi: ABIs.RewardClaimed,
    }),
    // vIP burn Transfer events
    options.getLogs({
      target: VIP_TOKEN,
      eventAbi: ABIs.Transfer,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', undefined, '0x0000000000000000000000000000000000000000000000000000000000000000'] as any,
    }),
  ])

  let netRewards = 0n
  for (const log of rewardClaimedLogs) {
    netRewards += BigInt(log.amount)
  }

  let totalBurnedVIP = 0n
  for (const log of burnLogs) {
    totalBurnedVIP += BigInt(log.value)
  }

  const grossRewards = netRewards * 10000n / (10000n - BigInt(feeBps))
  const protocolRewardFee = grossRewards - netRewards
  const unstakeFee = totalBurnedVIP / 1000n // 0.1% of burned vIP

  // Gross fees: all staking rewards + unstake fees
  dailyFees.addGasToken(grossRewards, METRIC.STAKING_REWARDS)
  dailyFees.add(VIP_TOKEN, unstakeFee, METRIC.DEPOSIT_WITHDRAW_FEES)

  // Protocol revenue: protocol fee share of staking rewards + 0.1% unstake fee on burned vIP
  dailyRevenue.addGasToken(protocolRewardFee, 'Staking Rewards To Protocol')
  dailyRevenue.add(VIP_TOKEN, unstakeFee, 'Unstake Fees To Protocol')

  // Supply side: staking rewards distributed to stakers
  dailySupplySideRevenue.addGasToken(netRewards, 'Staking Rewards To Stakers')

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.STORY]: {
      fetch,
      start: '2025-02-10',
    }
  },
  methodology: {
    Fees: 'Total gross staking rewards from Story protocol validators, plus 0.1% fee on burned vIP during unstaking. Gross rewards are derived from RewardPool RewardClaimed events using the on-chain protocol fee rate from getFeeBps().',
    Revenue: 'Protocol fee (determined by on-chain getFeeBps()) on staking rewards plus 0.1% fee on burned vIP during unstaking, retained by the Verio protocol.',
    ProtocolRevenue: 'Protocol fee on staking rewards plus 0.1% fee on burned vIP during unstaking, allocated to protocol.',
    SupplySideRevenue: 'Staking rewards distributed to vIP stakers after protocol fee deduction.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Gross staking rewards earned from staking IP in the Verio staking pool, derived from RewardPool RewardClaimed events.',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: '0.1% fee charged on the burned vIP when users unstake from the pool.',
    },
    Revenue: {
      'Staking Rewards To Protocol': 'Protocol fee share of staking rewards retained by the Verio protocol.',
      'Unstake Fees To Protocol': '0.1% unstake fee retained by the Verio protocol.',
    },
    ProtocolRevenue: {
      'Staking Rewards To Protocol': 'Protocol fee share of staking rewards retained by the Verio protocol.',
      'Unstake Fees To Protocol': '0.1% unstake fee retained by the Verio protocol.',
    },
    SupplySideRevenue: {
      'Staking Rewards To Stakers': 'Staking rewards distributed to vIP stakers after protocol fee deduction.',
    },
  },
}

export default adapter
