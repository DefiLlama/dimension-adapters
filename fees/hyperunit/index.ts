import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { queryHyperliquidIndexer } from '../../helpers/hyperliquid';

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const result = await queryHyperliquidIndexer(options)

  return {
    dailyFees: result.dailyUnitRevenue,
    dailyRevenue: result.dailyUnitRevenue,
    dailyProtocolRevenue: result.dailyUnitRevenue,
    dailyHoldersRevenue: '0'
  }
}


const methodology = {
  Fees: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  Revenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  ProtocolRevenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  HoldersRevenue: 'No Token Holders Revenue.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-13',
  methodology,
}

export default adapter;
