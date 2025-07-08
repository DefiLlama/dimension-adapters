import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const dailyVolume = createBalances()

  const logs = await getLogs({ target: '0xa979E1d73f233087d3808cFc02C119F5EA75DE36', eventAbi: 'event SilicaPools__Swap (bytes32 indexed poolHash, bytes32 orderHash, address indexed poolTokenRecipient, address indexed erc20Recipient, uint256 poolTokenId, uint256 poolTokenAmount, address erc20Token, uint256 erc20Amount)' })

  function addLogData(log: any) {
    dailyVolume.add(log.erc20Token, log.erc20Amount)
  }

  logs.forEach(addLogData)

  return { dailyVolume, }
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