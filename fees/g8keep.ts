import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from '../helpers/token';

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ options, tokens: [ADDRESSES.base.WETH], fromAddressFilter: '0x3C0B43867Cd04fEdfD6a95497e5ea7e3aFF8cCaE' , target: '0x28253c1A76256bf1D9095587826AfCC5705aF98a' })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-11-04',
    }
  },
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "Tokens trading and launching fees paid by users.",
    ProtocolRevenue: "Tokens trading and launching fees paid by users.",
  }
}
export default adapter
