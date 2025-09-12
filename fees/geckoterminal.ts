import { Adapter, BaseAdapter, FetchOptions } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";
import { getSolanaReceived } from '../helpers/token';
import { CHAIN } from "../helpers/chains";

const sol = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['3h5SPEzotUQDznpgCQev8jpDnBCtLkRj4PH997517C5j'] })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: 'All fees paid by users for token profile listing.',
    Revenue: 'All fees collected by GeckoTerminal.',
    ProtocolRevenue: 'All fees collected by GeckoTerminal.',
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: sol,
    },
  }
}

for (const [chain, item] of Object.entries(generateCBCommerceExports('0xb1f73Dbc8AEb72d62da3DBB5B41aC748680C0453'))) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: (item as any).fetch,
  }
}

export default adapter;
