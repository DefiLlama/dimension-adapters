import ADDRESSES from '../helpers/coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from '../helpers/token';


const fetchFees = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const fromAdddesses = [
    '0x43e656716cf49c008435a8196d8f825f66f37254',
    '0xcb7daa45ed2a9253ad3c900583b33bed822e8283',
    '0x49c7371daecb7f06fc7303a14ab80174453df4cf',
  ];
  const dailyFees = options.createBalances()
  for (const fromAdddress of fromAdddesses) {
    await addTokensReceived({ options, target: '0x6ceD48EfBb581A141667D7487222E42a3FA17cf7', fromAddressFilter: fromAdddress, balances: dailyFees, tokens: [ADDRESSES.polygon.USDC] })
  }
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1682899200,
    }
  }
}
export default adapter;
