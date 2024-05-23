import { CHAIN } from "../helpers/chains";
import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.XDAI, "https://blockscout.com/xdai/mainnet/api?module=stats&action=totalfees")