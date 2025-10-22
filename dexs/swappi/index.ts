import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://docs.swappi.io/swappi/products/exchange/token-swaps
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'Swappi collects 32% swap fees for protocol treasury and PPI buy back.',
    ProtocolRevenue: 'Swappi collects 12% swap fees for protocol treasury.',
    HoldersRevenue: 'Swappi collects 20% swap fees for PPI buy back.',
    SupplySideRevenue: 'Swappi distributes 68% swap fees to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xe2a6f7c0ce4d5d300f97aa7e125455f5cd3342f5', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.12, holdersRevenueRatio: 0.2 }),
  chains: [CHAIN.CONFLUX],
}

export default adapter;