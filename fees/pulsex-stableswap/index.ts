import { Adapter } from "../../adapters/types";
import volumeAdapter from "../../dexs/pulsex-stableswap";
import { getDexChainFees } from "../../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.0004;
const PROTOCOL_FEES = 0.0002 * 0.1439;
const SUPPLY_SIDE = 0.0002;
const HOLDERS_REVENUE = 0.0002 * 0.8561;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  supplySideRevenue: SUPPLY_SIDE,
  holdersRevenue: HOLDERS_REVENUE,
  revenue: 0.0002,
  userFees: TOTAL_FEES,
  volumeAdapter,
});

const adapter: Adapter = {
  version: 2,
    methodology: {
      UserFees: "User pays 0.04% fees on each stable swap.",
      ProtocolRevenue: "0.003% goes to an address which you can have no expectations (~7% of fees).",
      SupplySideRevenue: "LPs receive 0.02% (50% of fees).",
      HoldersRevenue: "0.017% (43% of fees) is used to buy and burn PLSX.",
      Revenue: "All revenue generated comes from user fees.",
      Fees: "All fees comes from the user."
    },
  adapter: feeAdapter
};

// test: yarn test fees pulsex-stableswap

export default adapter; 