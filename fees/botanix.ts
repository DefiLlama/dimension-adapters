import { blockHeaderFeeAdapter } from "../helpers/blockHeaderFees";
import { CHAIN } from "../helpers/chains";

export default blockHeaderFeeAdapter({
  chain: CHAIN.BOTANIX,
  start: "2025-07-01",
});
