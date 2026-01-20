import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const OKTO_BUILDER_ADDRESSES = [
  '0x05984fd37db96dc2a11a09519a8def556e80590b',
  '0x4fe1141b9066f3777f4bd4d4ac9d216173031dc1',
]

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  
  for (const address of OKTO_BUILDER_ADDRESSES) {
    const result = await fetchBuilderCodeRevenue({ options, builder_address: address });
    dailyVolume.addBalances(result.dailyVolume)
    dailyFees.addBalances(result.dailyFees)
    dailyRevenue.addBalances(result.dailyRevenue)
    dailyProtocolRevenue.addBalances(result.dailyProtocolRevenue)
  }
  

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'builder code revenue from Hyperliquid Perps Trades.',
  Revenue: 'builder code revenue from Hyperliquid Perps Trades.',
  ProtocolRevenue: 'builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2024-10-28',
  methodology,
  doublecounted: true,
  // isExpensiveAdapter: true,
}

export default adapter;
