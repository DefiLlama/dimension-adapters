import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://docs.oolongswap.com/special-features/dynamic-fees
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'Oolongswap collects 1/6 swap fees for protocol treasury.',
    ProtocolRevenue: 'Oolongswap collects 1/6 swap fees for protocol treasury.',
    SupplySideRevenue: 'Oolongswap distributes 5/6 swap fees to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x7DDaF116889D655D1c486bEB95017a8211265d29', userFeesRatio: 1, revenueRatio: 1/6, protocolRevenueRatio: 1/6 }),
  chains: [CHAIN.BOBA],
  start: 1635938988,
}

export default adapter;
