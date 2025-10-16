import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://zebra.gitbook.io/zebra-document/product/fees
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay dynamic amount of fees per swap.',
    UserFees: 'Users pay dynamic amount of fees per swap.',
    Revenue: 'Zebra collects 25% revenue from swap fees.',
    ProtocolRevenue: 'Zebra collects 25% revenue from swap fees.',
    SupplySideRevenue: 'Zebra distributes 75% swap fees to LPs.',
  },
  fetch: getUniV3LogAdapter({ factory: '0x96a7F53f7636c93735bf85dE416A4Ace94B56Bd9', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 }),
  chains: [CHAIN.SCROLL],
  start: '2023-11-16',
}

export default adapter;

