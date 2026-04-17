import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addTokensReceived } from "../../helpers/token"

const LIQUID_FACTORY = '0x04F1a284168743759BE6554f607a10CEBdB77760';
const WETH = '0x4200000000000000000000000000000000000006';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  await addTokensReceived({
    options,
    targets: [LIQUID_FACTORY],
    token: WETH,
    balances: dailyFees,
  })

  const dailyRevenue = dailyFees.clone(0.5)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
    Revenue: 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
    ProtocolRevenue: 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
  },
  breakdownMethodology: {
    Fees: {
      'Deployment Fees': 'Rainbow receives 50% of the 0.2% deployment fee collected by the Liquid Factory contract on Base',
    },
    Revenue: {
      'Deployment Fees': 'Rainbow receives 50% of deployment fees',
    },
    ProtocolRevenue: {
      'Deployment Fees': 'Rainbow receives 50% of deployment fees',
    },
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2026-03-14',
    }
  },
}

export default adapter
