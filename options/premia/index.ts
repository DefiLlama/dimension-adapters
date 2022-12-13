import { CHAIN } from '../../helpers/chains'
import { SimpleAdapter, ChainEndpoints } from '../../adapters/types'
import getChainData from './getChainData'

const endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premiav2',
  [CHAIN.ARBITRUM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-arbitrum',
  [CHAIN.FANTOM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-fantom',
  [CHAIN.OPTIMISM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-optimism',
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: string) => await getChainData(endpoints[chain], ts),
        start: async () => 1656154800,
      },
    }
  }, {}),
}

export default adapter
