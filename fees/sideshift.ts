import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// stakers got 25% of profits as daily XAI sends to the vault, ended 2026-06-03 (no profit data after)
const XAI = '0x35e78b3982E87ecfD5b3f3265B601c046cDBe232'
const SVXAI_VAULT = '0x3808708e761b988d23ae011ed0e12674fb66bd62'
const DISTRIBUTOR = '0xcdd37ada79f589c15bd4f8fd2083dc88e34a2af2'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const toTopic = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0')

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const transfers = await options.getLogs({
    target: XAI,
    topics: [TRANSFER_TOPIC, toTopic(DISTRIBUTOR), toTopic(SVXAI_VAULT)],
  })

  // skip integrator deposits (svXAI minted in the same tx)
  const depositTxs = new Set<string>()
  if (transfers.length) {
    const mints = await options.getLogs({
      target: SVXAI_VAULT,
      topics: [TRANSFER_TOPIC, toTopic('0x0000000000000000000000000000000000000000')],
    })
    mints.forEach((log: any) => depositTxs.add(log.transactionHash.toLowerCase()))
  }

  transfers.forEach((log: any) => {
    if (depositTxs.has(log.transactionHash.toLowerCase())) return
    const distributed = BigInt(log.data)
    dailyFees.add(XAI, distributed * 4n, 'Shift Profits')
    dailyRevenue.add(XAI, distributed * 3n, 'Shift Profits To Treasury')
    dailyRevenue.add(XAI, distributed, 'Shift Profits To XAI Stakers')
    dailyProtocolRevenue.add(XAI, distributed * 3n, 'Shift Profits To Treasury')
    dailyHoldersRevenue.add(XAI, distributed, 'Staking Distributions')
  })

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    }
  },
  methodology: {
    Fees: 'SideShift.ai profits from shifts, derived as 4x the XAI staking distribution (stakers received 25% of profits). XAI staking ended on 2026-06-03 and SideShift publishes no profit data, so values are 0 from 2026-06-04.',
    Revenue: 'All SideShift.ai profits, split between the treasury and XAI stakers.',
    ProtocolRevenue: '75% of profits kept by SideShift.ai.',
    HoldersRevenue: '25% of profits distributed to XAI stakers in XAI until the staking program ended on 2026-06-03.',
  },
  breakdownMethodology: {
    Fees: {
      'Shift Profits': 'SideShift.ai profits from shifts, derived as 4x the daily XAI distribution to the svXAI vault.',
    },
    Revenue: {
      'Shift Profits To Treasury': '75% of profits kept by SideShift.ai.',
      'Shift Profits To XAI Stakers': '25% of profits paid to XAI stakers.',
    },
    ProtocolRevenue: {
      'Shift Profits To Treasury': '75% of profits kept by SideShift.ai.',
    },
    HoldersRevenue: {
      'Staking Distributions': 'XAI sent by SideShift to the svXAI vault without minting shares, which raises the value of every staked XAI. Deposits made for integrators (which mint svXAI) are excluded.',
    },
  },
}

export default adapters
