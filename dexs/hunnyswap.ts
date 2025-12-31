import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const FACTORY = "0x0c6A0061F9D0afB30152b8761a273786e51bec6d";

// https://docs.hunnyswap.com/products/exchange/token-swap#trading-fees
const adapter: SimpleAdapter = {
    version: 2,
    methodology: {
        Fees: 'Users pay 0.3% per swap.',
        UserFees: 'Users pay 0.3% per swap.',
        SupplySideRevenue: '0.18% swap fees distributed to LPs.',
        Revenue: '0.12% swap fees goes to protocol and holders',
        ProtocolRevenue: '0.02% swap fees goes to treasury',
        HoldersRevenue: '0.1%  swap fees goes to LOVE and gXOXO token stakers'
    },
    fetch: getUniV2LogAdapter({ factory: FACTORY, userFeesRatio: 1, revenueRatio: 0.12 / 0.3, protocolRevenueRatio: 0.02 / 0.3, holdersRevenueRatio: 0.1 / 0.3 }),
    chains: [CHAIN.AVAX],
    start: "2022-06-06",
}

export default adapter;
