import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const factories: any = {
  [CHAIN.ETHEREUM]: '0xd34971BaB6E5E356fd250715F5dE0492BB070452',
  [CHAIN.ARBITRUM]: '0x359f20ad0f42d75a5077e65f30274cabe6f4f01a',
  [CHAIN.XDAI]: '0x5d48c95adffd4b40c1aaadc4e08fc44117e02179',
};

const methodology = {
  Fees: 'Swap fees paid by users.',
  UserFees: 'Swap fees paid by users.',
  Revenue: '10% swap fees collected by Swapr protocol.',
  ProtocolRevenue: '10% swap fees collected by Swapr protocol.',
  SupplySideRevenue: '90% swap fees distributed to LPs.',
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch: async function(options: FetchOptions) {
    const fetchFunction = getUniV2LogAdapter({ factory: factories[options.chain], userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 })
    return fetchFunction(options)
  },
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.XDAI],
}

export default adapter;