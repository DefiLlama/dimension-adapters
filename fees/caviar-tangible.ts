import ADDRESSES from '../helpers/coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from '../helpers/token';

const fetchFees = async (timestamp: number , _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = await addTokensReceived({ options, tokens: [ADDRESSES.polygon.USDC], fromAddressFilter: '0xbbc843dcb1009bc7dc988bceb5bb1b50299d9a6d' , target: '0x6ced48efbb581a141667d7487222e42a3fa17cf7' })

  return {
    dailyFees: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyRevenue: dailyFees,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1692144000,
    }
  }
}
export default adapter
