import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { queryHyperliquidIndexerV2 } from '../../helpers/hyperliquid-v2';

const fetch = async (options: FetchOptions) => {
  const result = await queryHyperliquidIndexerV2(options)

  // fees paid in Unit tokens, net of builder-code fees paid in them (those go to the builders),
  // the same amount hyperliquid-spot reports as Unit Revenue
  const dailyFees = options.createBalances()
  dailyFees.add(result.dailyUnitFees, 'Spot fees on Unit markets')
  dailyFees.add(result.dailyUnitBuildersFees.clone(-1), 'Spot fees on Unit markets')
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
  Fees: 'Trading fees from spot token volume where Hyperunit is the deployer of the token, excluding builder code fees.',
  Revenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  ProtocolRevenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  HoldersRevenue: 'No Token Holders Revenue.',
}

const breakdownMethodology = {
  Fees: {
    'Spot fees on Unit markets': 'Fees from Hyperliquid spot trades paid in assets deployed by Unit, excluding builder code fees.',
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
