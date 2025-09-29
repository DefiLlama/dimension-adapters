import { Adapter, BaseAdapter } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";

const methodology = {
  Fees: 'All fees paid by users.',
  Revenue: 'All fees collected by DeBank Cloud.',
  ProtocolRevenue: 'All fees collected by DeBank Cloud.',
}

const adapter: Adapter = {
  methodology,
  version: 2,
  adapter: {},
}

for (const [chain, item] of Object.entries(generateCBCommerceExports('0x3c6923D09ec77648ca923fFB4e50251120756faa'))) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: (item as any).fetch,
  }
}

export default adapter;
