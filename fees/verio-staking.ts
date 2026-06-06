import { SimpleAdapter, FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

const VERIO_IP_STAKE_POOL = '0xf6701A6A20639f0E765bA7FF66FD4f49815F1a27'
const VIP_TOKEN = '0x5267f7ee069ceb3d8f1c760c215569b79d0685ad'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [rewardLogs, burnLogs] = await Promise.all([
    options.getLogs({
      target: VERIO_IP_STAKE_POOL,
      eventAbi: 'event RewardReceived(uint256 amount)',
    }),
    // vIP burn Transfer events
    options.getLogs({
      target: VIP_TOKEN,
      eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', undefined, '0x0000000000000000000000000000000000000000000000000000000000000000'] as any,
    }),
  ])

  let totalRewards = 0n
  for (const log of rewardLogs) {
    totalRewards += BigInt(log.amount)
  }

  let totalBurnedVIP = 0n
  for (const log of burnLogs) {
    totalBurnedVIP += BigInt(log.value)
  }

  const unstakeFee = totalBurnedVIP / 1000n // 0.1% of burned vIP
  const rewardFee = totalRewards * 15n / 100n
  const stakerRewards = totalRewards * 85n / 100n

  // Gross Protocol Revenue: all staking rewards + unstake fees
  dailyFees.addGasToken(totalRewards, METRIC.STAKING_REWARDS)
  dailyFees.add(VIP_TOKEN, unstakeFee, METRIC.DEPOSIT_WITHDRAW_FEES)

  // Protocol revenue: 15% of staking rewards + 0.1% unstake fee on burned vIP
  dailyRevenue.addGasToken(rewardFee, 'Staking Rewards To Protocol')
  dailyRevenue.add(VIP_TOKEN, unstakeFee, 'Unstake Fees To Protocol')

  // Supply side: 85% of staking rewards distributed to stakers
  dailySupplySideRevenue.addGasToken(stakerRewards, 'Staking Rewards To Stakers')

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
    Fees: 'Total staking rewards received by the Verio IP Stake Pool from Story protocol validators, plus 0.1% fee on burned vIP during unstaking.',
    Revenue: '15% fee on staking rewards plus 0.1% fee on burned vIP during unstaking, retained by the Verio protocol.',
    ProtocolRevenue: '15% fee on staking rewards plus 0.1% fee on burned vIP during unstaking, allocated to protocol.',
    SupplySideRevenue: '85% of staking rewards distributed to vIP stakers.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards earned by users from staking IP in the Verio staking pool.',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: '0.1% fee charged on the burned vIP when users unstake from the pool.',
    },
    Revenue: {
      'Staking Rewards To Protocol': '15% of staking rewards retained by the Verio protocol.',
      'Unstake Fees To Protocol': '0.1% unstake fee retained by the Verio protocol.',
    },
    ProtocolRevenue: {
      'Staking Rewards To Protocol': '15% of staking rewards retained by the Verio protocol.',
      'Unstake Fees To Protocol': '0.1% unstake fee retained by the Verio protocol.',
    },
    SupplySideRevenue: {
      'Staking Rewards To Stakers': '85% of staking rewards distributed to vIP stakers.',
    },
  },
}

export default adapter
