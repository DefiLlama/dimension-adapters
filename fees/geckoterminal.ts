import { Adapter, BaseAdapter, Dependencies, FetchOptions } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";
import { getSolanaReceived } from '../helpers/token';
import { CHAIN } from "../helpers/chains";

const sol = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['3h5SPEzotUQDznpgCQev8jpDnBCtLkRj4PH997517C5j'] })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
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

const OWN_BRIDGE_TXS = [
  '0x4c7e381567082ee92c2dd97c5f2ec59bc8fe228aa5d4fa1d1979d1f391e3b5cd',
  '0x73054496c849c961aa89059abe4a62131506bb6f4c75b534d7c2e5418634d03c',
]

for (const [chain, item] of Object.entries(generateCBCommerceExports('0xb1f73Dbc8AEb72d62da3DBB5B41aC748680C0453', OWN_BRIDGE_TXS))) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: (item as any).fetch,
  }
}

export default adapter;
