import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://docs.solarflare.io/tokenomics#revenues
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'Solarflare collects 20% swap fees for FLARE buy back.',
    ProtocolRevenue: 'No revenue for Solarflare protocol.',
    HoldersRevenue: 'Solarflare collects 20% swap fees for FLARE buy back.',
    SupplySideRevenue: 'Solarflare distributes 80% swap fees to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x19B85ae92947E0725d5265fFB3389e7E4F191FDa', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.12, holdersRevenueRatio: 0.2 }),
  chains: [CHAIN.MOONBEAM],
}

export default adapter;

