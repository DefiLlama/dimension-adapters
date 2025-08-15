import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://zebra.gitbook.io/zebra-document/product/fees
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'Zebra collects 25% revenue from swap fees.',
    ProtocolRevenue: 'Zebra collects 25% revenue from swap fees.',
    SupplySideRevenue: 'Zebra distributes 75% swap fees to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xa63eb44c67813cad20A9aE654641ddc918412941', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 }),
  chains: [CHAIN.SCROLL],
  start: 1698364800,
}

export default adapter;
