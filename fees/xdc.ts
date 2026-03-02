import { blockHeaderFeeAdapter } from "../helpers/blockHeaderFees";
import { CHAIN } from "../helpers/chains";

export default blockHeaderFeeAdapter({
  chain: CHAIN.XDC,
  start: "2019-06-01",
});
