import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"

const LIQUID_FACTORY = '0x04F1a284168743759BE6554f607a10CEBdB77760';
const WETH = '0x4200000000000000000000000000000000000006';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const deploymentFees = await addTokensReceived({
    options,
    targets: [LIQUID_FACTORY],
    token: WETH,
  })

  const dailyFees = deploymentFees.clone(0.5, 'Deployment Fees from Liquid')

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
  Revenue: 'All fees are revenue',
  ProtocolRevenue: 'All revenue goes to the protocol',
}

const breakdownMethodology = {
  Fees: {
    'Deployment Fees from Liquid': 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
  },
  Revenue: {
    'Deployment Fees from Liquid': 'Rainbow receives 50% of deployment fees',
  },
  ProtocolRevenue: {
    'Deployment Fees from Liquid': 'Rainbow receives 50% of deployment fees',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: '2026-03-14',
  methodology,
  breakdownMethodology,
  doublecounted: true, // liquid-protocol
}

export default adapter
