import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { CHAIN } from "../helpers/chains";

const adapter = blockscoutFeeAdapter2(CHAIN.KROMA)

export default {
  ...adapter,
  deadFrom: '2025-06-30', // Kroma blockchain shutdown
}
