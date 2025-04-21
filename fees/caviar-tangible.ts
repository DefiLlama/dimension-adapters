import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from '../helpers/token';

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ options, tokens: [ADDRESSES.polygon.USDC], fromAddressFilter: '0xbbc843dcb1009bc7dc988bceb5bb1b50299d9a6d' , target: '0x6ced48efbb581a141667d7487222e42a3fa17cf7' })

  return {
    dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-08-16',
    }
  }
}
export default adapter
