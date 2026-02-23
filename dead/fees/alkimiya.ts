import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const dailyFees = createBalances()

  const logs = await getLogs({ target: '0xa979E1d73f233087d3808cFc02C119F5EA75DE36', eventAbi: 'event SilicaPools__FillFeePaid (address indexed payer, bytes32 indexed poolHash, bytes32 indexed orderHash, uint256 tokenId, address tokenPaid, uint256 amount)' })

  function addLogData(log: any) {
    dailyFees.add(log.tokenPaid, log.amount, METRIC.TRADING_FEES)
  }

  logs.forEach(addLogData)

  return { dailyFees, dailyRevenue: dailyFees, }
}


const methodology = {
  Fees: 'Fill fees charged by the SilicaPools contract when users fill orders for hashpower derivatives.',
  Revenue: 'All fill fees accrue as protocol revenue.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees paid by users when filling orders in Alkimiya silica pools, collected as marketplace fees for trading hashpower derivatives.',
  },
}

export default {
  version: 2,
  start: '2025-04-03',
  deadFrom: '2025-10-01',
  fetch,
  chains: [CHAIN.BASE],
  methodology,
  breakdownMethodology,
}