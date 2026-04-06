import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"

// Rainbow Wallet predictions fee wallet on Polygon
const RainbowFeeWallet = '0x757758506d6a4F8a433F8BECaFd52545f9Cb050a';

// USDC.e on Polygon
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const fees = await addTokensReceived({
    options,
    targets: [RainbowFeeWallet],
    token: USDC_E,
  })

  dailyFees.add(fees, 'Trading Fees');
  dailyRevenue.add(fees, 'Trading Fees');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Rainbow Wallet charges ~1% of shares value on prediction market trades',
    Revenue: 'All fees go to the Rainbow protocol fee wallet',
    ProtocolRevenue: 'All fees go to the Rainbow protocol fee wallet',
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'USDC.e fee charged on each prediction market open/close trade',
    },
    Revenue: {
      'Trading Fees': 'All trading fees flow to the Rainbow fee wallet',
    },
    ProtocolRevenue: {
      'Trading Fees': 'All trading fees flow to the Rainbow fee wallet',
    },
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2025-12-01',
    }
  },
}

export default adapter