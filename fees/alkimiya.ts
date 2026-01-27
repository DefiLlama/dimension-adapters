import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const dailyFees = createBalances()

  const logs = await getLogs({ target: '0xa979E1d73f233087d3808cFc02C119F5EA75DE36', eventAbi: 'event SilicaPools__FillFeePaid (address indexed payer, bytes32 indexed poolHash, bytes32 indexed orderHash, uint256 tokenId, address tokenPaid, uint256 amount)' })

  function addLogData(log: any) {
    dailyFees.add(log.tokenPaid, log.amount)
  }

  logs.forEach(addLogData)

  return { dailyFees, dailyRevenue: dailyFees, }
}


export default {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      start: '2025-04-03',
      fetch,
    },
  }
}