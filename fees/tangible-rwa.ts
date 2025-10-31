import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from '../helpers/token';

const fetchFees = async (options: FetchOptions) => {
  const fromAdddesses = [
    '0x43e656716cf49c008435a8196d8f825f66f37254',
    '0xcb7daa45ed2a9253ad3c900583b33bed822e8283',
    '0x49c7371daecb7f06fc7303a14ab80174453df4cf',
  ];
  const dailyFees = options.createBalances()
  await addTokensReceived({ options, target: '0x6ceD48EfBb581A141667D7487222E42a3FA17cf7', fromAdddesses: fromAdddesses, balances: dailyFees, tokens: [ADDRESSES.polygon.USDC] })
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-05-01',
    }
  },
  methodology: {
    Fees: "Total yields from RWA backing assets.",
    Revenue: "Total yields from RWA backing assets.",
    HoldersRevenue: "No holders revenue",
  },
}
export default adapter;
