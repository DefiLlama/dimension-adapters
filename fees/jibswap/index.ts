import { Adapter } from "../../adapters/types";
import volumeAdapter from "../../dexs/jibswap";
import { getDexChainFees } from "../../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.0005;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  adapter: feeAdapter
};

export default adapter;
