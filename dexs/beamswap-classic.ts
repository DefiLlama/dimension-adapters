import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees: "User pays 0.30% fees on each swap.",
    Fees: "A 0.30% of each swap is collected as trading fees",
    Revenue: "Protocol receives 0.13% on each swap.",
    ProtocolRevenue: "Protocol receives 0.13% on each swap.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Stakers received $GLINT in staking rewards.",
  },
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch: getUniV2LogAdapter({ factory: '0x985BcA32293A7A496300a48081947321177a86FD', revenueRatio: 0.13/0.30, protocolRevenueRatio: 0.13/0.30 }),
    },
  },
};

export default adapter;
