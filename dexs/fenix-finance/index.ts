import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.1% per swap for volitile pools and 0.03% per swap for stable pools.',
    UserFees: 'Users pay 0.1% per swap.',
    Revenue: 'Protocol collects 10% swap fees.',
    ProtocolRevenue: 'Protocol collects 10% swap fees.',
    SupplySideRevenue: '90% swap fees distributes to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xa19c51d91891d3df7c13ed22a2f89d328a82950f', fees: 0.001, stableFees: 0.0003, userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 }),
  chains: [CHAIN.BLAST],
}

export default adapter;