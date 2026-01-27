import { Adapter } from "../../adapters/types";
import volumeAdapter from "../../dexs/pulsex-v2";
import { getDexChainFees } from "../../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.0029;
const PROTOCOL_FEES = 0.0007 * 0.1439;
const SUPPLY_SIDE = 0.0022;
const HOLDERS_REVENUE = 0.0007 * 0.8561;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  supplySideRevenue: SUPPLY_SIDE,
  holdersRevenue: HOLDERS_REVENUE,
  revenue: 0.0007,
  userFees: TOTAL_FEES,
  volumeAdapter,
});

const adapter: Adapter = {
  methodology: {
    UserFees: "User pays 0.29% fees on each swap.",
    ProtocolRevenue: "0.01% goes to an address which you can have no expectations (~4% of fees).",
    SupplySideRevenue: "LPs receive 0.22% (~76% of fees).",
    HoldersRevenue: "0.06% (~20% of fees) is used to buy and burn PLSX.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees comes from the user."
  },
  version: 2,
  adapter: feeAdapter
};

// test: yarn test fees pulsex-v2

export default adapter; 