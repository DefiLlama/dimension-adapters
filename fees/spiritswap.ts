import { Adapter } from "../adapters/types";
import volumeAdapter from "@defillama/adapters/volumes/adapters/spiritswap";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.0022;
const PROTOCOL_FEES = 0.00045;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  adapter: feeAdapter
};


export default adapter;