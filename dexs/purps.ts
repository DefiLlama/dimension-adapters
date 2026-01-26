import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: '80% swap fees distributed to LPs.',
    Revenue: '20% swap fees collected by Purps.',
    ProtocolRevenue: '20% swap fees collected by Purps.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xAfE4d3eB898591ACe6285176b26f0F5BEb894447', userFeesRatio: 1, revenueRatio: 0.2, protocolRevenueRatio: 0.2 }),
  chains: [CHAIN.MONAD],
}

export default adapter;
