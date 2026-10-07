import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { queryHyperliquidIndexer } from '../../helpers/hyperliquid';

const fetch = async (options: FetchOptions) => {
  const result = await queryHyperliquidIndexer(options)

  const dailyFees = options.createBalances()
  dailyFees.add(result.dailyUnitRevenue, 'Spot fees on Unit markets')
  const dailyRevenue = dailyFees.clone(1, 'Unit Revenue')

  return {
    dailyVolume: result.dailyUnitVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailyHoldersRevenue: '0'
  }
}


const methodology = {
  Volume: 'Hyperliquid spot trading volume from tokens were deployed by Unit protocol.',
  Fees: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  Revenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  ProtocolRevenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  HoldersRevenue: 'No Token Holders Revenue.',
}

const breakdownMethodology = {
  Fees: {
    'Spot fees on Unit markets': 'Fees from Hyperliquid spot trades paid in assets deployed by Unit.',
  },
  Revenue: {
    'Unit Revenue': 'All fees earned on Unit spot markets go to Unit.',
  },
  ProtocolRevenue: {
    'Unit Revenue': 'All fees earned on Unit spot markets go to Unit.',
  },
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-13',
  methodology,
  breakdownMethodology,
}

export default adapter;
