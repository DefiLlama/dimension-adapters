import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

const adapter = uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: '0xa36b55DBe8e83Eb69C686368cF93ABC8A238CC5f', },
})

adapter.deadFrom = '2025-06-01'

export default adapter;